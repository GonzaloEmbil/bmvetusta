#!/usr/bin/env python3
"""
Convierte la exportación de socios de Cluber (members.xlsx) en el SQL que
carga la tabla socios_anteriores de D1.

El script no contiene datos: los lee del Excel y escribe el SQL en un archivo
que debe quedar FUERA del repositorio, porque lleva nombres, DNI y teléfonos.

    python3 worker/scripts/importar-cluber.py ~/Downloads/members.xlsx 2025/2026 /tmp/socios.sql
    npx wrangler d1 execute bmvetusta-abonados --remote --file /tmp/socios.sql
    rm /tmp/socios.sql

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
"""
import re
import sys
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


def sql(v):
    if v is None:
        return 'NULL'
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    if len(sys.argv) != 4:
        sys.exit('Uso: importar-cluber.py members.xlsx 2025/2026 salida.sql')
    ruta, temporada, salida = sys.argv[1:]
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
        })

    campos = list(socios[0].keys()) if socios else []
    with open(salida, 'w', encoding='utf-8') as out:
        out.write(f'DELETE FROM socios_anteriores WHERE temporada = {sql(temporada)};\n')
        for s in socios:
            out.write(f'INSERT INTO socios_anteriores ({", ".join(campos)}) VALUES '
                      f'({", ".join(sql(s[c]) for c in campos)});\n')

    print(f'{len(socios)} socios de {temporada} escritos en {salida}')
    for d in descartes:
        print('  descartada:', d)


if __name__ == '__main__':
    main()
