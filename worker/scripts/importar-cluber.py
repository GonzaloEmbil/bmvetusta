#!/usr/bin/env python3
"""
Convierte las exportaciones de Cluber en el SQL que carga la tabla
socios_anteriores de D1: la de socios (members.xlsx) y, opcionalmente, la de
cargos, que dice quién pagó, cuánto y qué cuota.

El script no contiene datos: los lee de los Excel y escribe el SQL en un
archivo que debe quedar FUERA del repositorio, porque lleva nombres, DNI y
teléfonos.

    python3 worker/scripts/importar-cluber.py ~/Downloads/members.xlsx 2025/2026 /tmp/socios.sql ~/Downloads/cargos.xlsx
    npx wrangler d1 execute bmvetusta-abonados --remote --file /tmp/socios.sql
    rm /tmp/socios.sql

Cómo se usan los cargos:
  · Sólo cuentan las cuotas de socio pagadas dentro de la temporada (de
    julio a junio). Las de fuera son de otra temporada.
  · Cada cargo se asigna al socio por el nombre de quien paga. Si paga el
    titular de un abono familiar o de matrimonio, cuenta como pagado para
    todas las personas de ese abono; el importe va sólo en el titular, como
    en las altas propias.
  · Quien pagó pero no aparece en la exportación de socios (Cluber no la da
    completa) se añade con los datos del cargo.

Se puede repetir cuantas veces haga falta: antes de insertar borra lo que
hubiera de esa temporada, así que cargar una exportación más completa
sustituye a la anterior en vez de duplicarla.

Qué se descarta a propósito:
  · IBAN, dirección y código postal: el panel no los necesita.
  · Las filas «Nueva alta»: son altas de la temporada nueva hechas todavía en
    Cluber, no socios de la anterior.
  · La fila repetida de quien titula un abono familiar: Cluber la lista una
    vez como titular y otra dentro de su propio abono, con otro número. Se
    conserva la de titular, que es la que trae DNI, teléfono y correo.
  · Quien empezó el alta y nunca la completó: sin número de socio, sin fecha
    de alta y sin ningún pago. No llegó a ser abonado. (Si interesa su correo
    para campañas, va a mano a la tabla contactos, lista «otros».)
"""
import re
import sys
from collections import Counter
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def leer_xlsx(ruta):
    """Primera hoja del Excel como lista de diccionarios por cabecera. Se lee
    el XML directamente para no depender de librerías externas."""
    z = zipfile.ZipFile(ruta)
    compartidas = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
            compartidas.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    filas = []
    for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iter('{%s}row' % NS['m']):
        fila = {}
        for c in row.findall('m:c', NS):
            col = re.match(r'[A-Z]+', c.get('r')).group()
            v = c.find('m:v', NS)
            if c.get('t') == 's' and v is not None:
                fila[col] = compartidas[int(v.text)]
            elif c.get('t') == 'inlineStr':
                fila[col] = ''.join(t.text or '' for t in c.iter('{%s}t' % NS['m']))
            else:
                fila[col] = v.text if v is not None else ''
        filas.append(fila)
    cab = filas[0]
    return [{cab[k]: f.get(k, '') for k in cab} for f in filas[1:]]


def columna(fila, empieza):
    """Las columnas de consentimiento tienen cabeceras larguísimas: se buscan
    por cómo empiezan."""
    for k, v in fila.items():
        if k.startswith(empieza):
            return v
    return ''


def clave_nombre(s):
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
    return ' '.join(re.sub(r'[^a-z0-9 ]', ' ', s).split())


def fecha(s):
    """Cluber exporta DD-MM-AAAA; D1 guarda AAAA-MM-DD, como el resto."""
    m = re.match(r'(\d{2})-(\d{2})-(\d{4})', s.strip())
    return f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else ''


def telefono(s):
    """Cluber antepone 0034. Se guarda como el formulario: nueve cifras."""
    s = re.sub(r'\D', '', s)
    if s.startswith('0034'):
        s = s[4:]
    elif len(s) == 11 and s.startswith('34'):
        s = s[2:]
    return s


def si_no(v):
    return 'Sí' if v.strip() in ('1', 'true', 'True', 'Sí', 'Si') else 'No'


def cuota(fila):
    c = fila.get('Cuota', '').strip()
    if not c:
        return ''
    try:
        precio = float(fila.get('Precio total') or 0)
    except ValueError:
        precio = 0
    return c.capitalize() + (f' · {precio:g} €' if precio else '')


PARTICULAS = {'de', 'del', 'la', 'las', 'los', 'y', 'e'}


def palabras(nombre):
    return [w for w in clave_nombre(nombre).split() if w not in PARTICULAS]


def mismo_nombre(a, b):
    """Uno contiene al otro entero y comparten al menos dos palabras: la misma
    regla que usa el Worker para ver quién ha renovado. Las repetidas cuentan
    cada vez: «Daniel Fernández Fernández» no está en «Daniel Fernández Conde»."""
    menor, mayor = sorted((palabras(a), palabras(b)), key=len)
    return len(menor) >= 2 and not (Counter(menor) - Counter(mayor))


def modalidad(texto):
    t = clave_nombre(texto)
    for clave, nombre in (('familiar', 'Familiar'), ('matrimonio', 'Matrimonio'),
                          ('sub 18', 'Sub 18'), ('sub18', 'Sub 18'), ('adulto', 'Adulto')):
        if clave in t:
            return nombre
    return ''


def rango(temporada):
    """'2025/2026' → del 1 de julio de 2025 al 30 de junio de 2026."""
    a, b = temporada.split('/')
    return f'{a}-07-01', f'{b}-06-30'


def aplicar_cargos(socios, ruta, temporada):
    ini, fin = rango(temporada)
    cargos = [c for c in leer_xlsx(ruta)
              if c.get('Tipo de cargo', '').strip() == 'Cuota de socio'
              and c.get('Estado', '').strip() == 'Pagado'
              and ini <= c.get('Fecha', '')[:10] <= fin]
    añadidos = []
    for c in cargos:
        pagador = ' '.join(c.get('Pagador', '').split())
        datos = {
            'pagado': 1,
            'modalidad': modalidad(c.get('Descripción', '')),
            'fecha_pago': c.get('Fecha', '')[:10],
            'pago': 'Tarjeta' if c.get('Método de pago', '').strip() == 'TPV' else c.get('Método de pago', '').strip(),
        }
        importe = int(round(float(c.get('Importe') or 0)))
        socio = (next((s for s in socios if not s['titular'] and mismo_nombre(s['nombre'], pagador)), None)
                 or next((s for s in socios if mismo_nombre(s['nombre'], pagador)), None))
        if not socio:
            socio = {'temporada': temporada, 'numero': None, 'nombre': pagador, 'dni': '', 'telefono': '',
                     'email': '', 'titular': '', 'cuota': '', 'alta': datos['fecha_pago'], 'pago': '',
                     'localidad': '', 'imagen': '', 'comunicaciones': '',
                     'modalidad': '', 'importe': 0, 'pagado': 0, 'fecha_pago': ''}
            socios.append(socio)
            añadidos.append(pagador)
        socio.update(datos, importe=importe)
        # Las demás personas de su abono quedan pagadas con él, sin importe.
        for s in socios:
            if s is not socio and s['titular'] and clave_nombre(s['titular']) == clave_nombre(socio['nombre']):
                s.update(datos, importe=0)
    return len(cargos), añadidos


def sql(v):
    if v is None:
        return 'NULL'
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    if len(sys.argv) not in (4, 5):
        sys.exit('Uso: importar-cluber.py members.xlsx 2025/2026 salida.sql [cargos.xlsx]')
    ruta, temporada, salida = sys.argv[1:4]
    filas = leer_xlsx(ruta)

    titulares = {clave_nombre(f'{f["Nombre"]} {f["Apellidos"]}')
                 for f in filas if not f.get('Socio titular', '').strip()}

    socios, descartes = [], []
    for f in filas:
        nombre = ' '.join(f'{f["Nombre"]} {f["Apellidos"]}'.split())
        titular = f.get('Socio titular', '').strip()
        if f.get('Renovación', '').strip() == 'Nueva alta':
            descartes.append(f'{nombre} (alta de la temporada nueva)')
            continue
        if titular and clave_nombre(titular) == clave_nombre(nombre) and clave_nombre(nombre) in titulares:
            descartes.append(f'{nombre} (repetida dentro de su propio abono)')
            continue
        numero = f.get('Nº Socio', '').strip()
        socios.append({
            'temporada': temporada,
            'numero': int(float(numero)) if numero else None,
            'nombre': nombre,
            'dni': re.sub(r'\s', '', f.get('Documento de identidad', '')).upper(),
            'telefono': telefono(f.get('Teléfono', '')),
            'email': f.get('Email', '').strip().lower(),
            'titular': titular,
            'cuota': cuota(f),
            'alta': fecha(f.get('Fecha alta/renovación', '')),
            'pago': f.get('Método de pago', '').strip(),
            'localidad': f.get('Ciudad', '').strip(),
            'imagen': si_no(columna(f, 'Derechos de im')),
            'comunicaciones': si_no(columna(f, 'Comunicaciones del club')),
            # Sin cargos, lo único que se sabe es la cuota que Cluber anota
            # a veces en la ficha; el pago lo confirman los cargos.
            'modalidad': modalidad(f.get('Cuota', '')),
            'importe': int(round(float(f.get('Precio total') or 0))) if not titular else 0,
            'pagado': 0,
            'fecha_pago': '',
        })

    cargos, añadidos = (aplicar_cargos(socios, sys.argv[4], temporada) if len(sys.argv) == 5 else (0, []))

    completos = []
    for s in socios:
        if not s['titular'] and not s['numero'] and not s['alta'] and not s['pagado']:
            descartes.append(f'{s["nombre"]} (nunca completó el alta: sin número, fecha ni pago)')
        else:
            completos.append(s)
    socios = completos

    campos = list(socios[0].keys()) if socios else []
    with open(salida, 'w', encoding='utf-8') as out:
        out.write(f'DELETE FROM socios_anteriores WHERE temporada = {sql(temporada)};\n')
        for s in socios:
            out.write(f'INSERT INTO socios_anteriores ({", ".join(campos)}) VALUES '
                      f'({", ".join(sql(s[c]) for c in campos)});\n')

    print(f'{len(socios)} socios de {temporada} escritos en {salida}')
    for d in descartes:
        print('  descartada:', d)
    if len(sys.argv) == 5:
        print(f'{cargos} cuotas pagadas en la temporada; {sum(s["pagado"] for s in socios)} socios quedan como pagados')
        for a in añadidos:
            print('  añadido desde los cargos (no estaba en la exportación de socios):', a)
        for s in socios:
            if not s['pagado'] and not s['titular']:
                print('  sin cargo pagado:', s['nombre'], f'(nº {s["numero"]})' if s['numero'] else '(sin nº)')


if __name__ == '__main__':
    main()
