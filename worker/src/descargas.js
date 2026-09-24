/**
 * Descargas del panel: CSV, Excel (.xlsx) y PDF.
 *
 * Todo se genera en el navegador con los datos que ya están en la página: no
 * hace falta volver a pedirlos al servidor ni cargar librerías de fuera, que
 * la política de seguridad del panel tampoco permitiría. Se descarga lo que se
 * está viendo: si hay una búsqueda o un filtro puesto, sólo esas filas.
 *
 * Va en String.raw y no en una plantilla normal para que las barras invertidas
 * lleguen tal cual a la página: aquí hay muchas (escapes de PDF, saltos de
 * línea) y en una plantilla normal habría que escribirlas todas dobles.
 * Consecuencia: este código no puede llevar comillas invertidas ni «${».
 */
export const DESCARGAS_JS = String.raw`
  // ── Qué se descarga ───────────────────────────────────────────────────────
  function vistaActiva(){ return document.getElementById('vista-anterior').hidden ? 'actual' : 'anterior'; }

  function tablaDescarga(){
    if (vistaActiva() === 'anterior') {
      return {
        titulo: 'Socios 2025/26', hoja: 'Socios 2025-26', archivo: 'socios-2025-2026',
        filas: listaAnterior(), total: anteriores.length,
        cols: [
          { t: 'Nº socio', num: true, v: function(s){ return s.numero || ''; } },
          { t: '¿Ha renovado?', v: function(s){ return s.renovado ? 'Sí (nº ' + s.renovado + ')' : 'No'; } },
          { t: 'Nombre', v: function(s){ return s.nombre; } },
          { t: 'Vínculo', v: function(s){ return s.titular ? 'En el abono de ' + s.titular : 'Titular'; } },
          { t: 'Alta', v: function(s){ return s.alta ? fechaSuelta(s.alta) : ''; } },
          { t: 'Cuota', v: function(s){ return s.cuota; } },
          { t: 'Pago', v: function(s){ return s.pago; } },
          { t: 'DNI/NIE', v: function(s){ return s.dni; } },
          { t: 'Móvil', v: function(s){ return s.telefono; } },
          { t: 'Correo', v: function(s){ return s.email; } },
          { t: 'Localidad', v: function(s){ return s.localidad; } },
          { t: 'Imagen', v: function(s){ return s.imagen; } },
          { t: 'Comunic.', v: function(s){ return s.comunicaciones; } }
        ]
      };
    }
    return {
      titulo: 'Abonados 2026/27', hoja: 'Abonados 2026-27', archivo: 'abonados-2026-2027',
      filas: listaActual(), total: datos.length,
      cols: [
        { t: 'Nº socio', num: true, v: function(a){ return a.id; } },
        { t: 'Pagado', v: function(a){ return a.pagado ? 'Sí' : 'No'; } },
        { t: 'Nombre', v: function(a){ return a.nombre; } },
        { t: 'Vínculo', v: function(a){ return a.titular_id ? (a.parentesco || 'Asociado') + ' del nº ' + a.titular_id : 'Titular'; } },
        { t: 'Alta', v: function(a){ return fecha(a.creado); } },
        { t: 'Modalidad', v: function(a){ return a.modalidad; } },
        { t: 'Pago', v: function(a){ return a.pago; } },
        // Sólo el titular lleva importe: en los asociados va vacío, no a cero.
        { t: 'Importe (€)', num: true, v: function(a){ return a.importe || ''; } },
        { t: 'DNI/NIE', v: function(a){ return a.dni; } },
        { t: 'Nacimiento', v: function(a){ return fechaSuelta(a.nacimiento); } },
        { t: 'Móvil', v: function(a){ return a.telefono; } },
        { t: 'Correo', v: function(a){ return a.email; } },
        { t: 'Localidad', v: function(a){ return a.localidad; } },
        { t: 'Imagen', v: function(a){ return a.imagen; } },
        { t: 'Comunic.', v: function(a){ return a.comunicaciones; } },
        { t: 'Tutor/a legal', v: function(a){
          return a.tutor ? [a.tutor.nombre, a.tutor.dni, a.tutor.telefono].filter(Boolean).join(' · ') : '';
        } }
      ]
    };
  }

  function matriz(d){
    return d.filas.map(function(f){
      return d.cols.map(function(c){ var v = c.v(f); return v == null ? '' : v; });
    });
  }

  function guardarArchivo(blob, nombre){
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = u; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(u); }, 1000);
  }

  // ── CSV ───────────────────────────────────────────────────────────────────
  // Punto y coma y marca BOM: es lo que Excel en español espera para abrirlo
  // con las columnas separadas y los acentos bien.
  function descargarCSV(d){
    var celda = function(v){ return '"' + String(v).replace(/"/g, '""') + '"'; };
    var lineas = [d.cols.map(function(c){ return celda(c.t); }).join(';')]
      .concat(matriz(d).map(function(f){ return f.map(celda).join(';'); }));
    guardarArchivo(new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' }), d.archivo + '.csv');
  }

  // ── Excel ─────────────────────────────────────────────────────────────────
  // Un .xlsx es un zip de archivos XML. Se escribe el mínimo que Excel,
  // Numbers y Google Sheets aceptan, y se empaqueta sin comprimir.
  function xmlEsc(s){
    return String(s).replace(/[&<>"]/g, function(c){
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function colLetra(i){
    var s = ''; i++;
    while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function descargarExcel(d){
    var m = matriz(d);
    var filas = ['<row r="1">' + d.cols.map(function(c, i){
      return '<c r="' + colLetra(i) + '1" t="inlineStr" s="1"><is><t>' + xmlEsc(c.t) + '</t></is></c>';
    }).join('') + '</row>'];
    m.forEach(function(f, j){
      var r = j + 2;
      filas.push('<row r="' + r + '">' + f.map(function(v, i){
        if (v === '') return '';
        var ref = colLetra(i) + r;
        // Nº de socio e importe van como número, para poder sumar y ordenar.
        if (d.cols[i].num && !isNaN(Number(v))) return '<c r="' + ref + '"><v>' + Number(v) + '</v></c>';
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>';
      }).join('') + '</row>');
    });
    var anchos = d.cols.map(function(c, i){
      var w = c.t.length;
      m.forEach(function(f){ w = Math.max(w, String(f[i]).length); });
      return Math.min(Math.max(w + 2, 8), 50);
    });
    var rango = 'A1:' + colLetra(d.cols.length - 1) + (m.length + 1);
    var hoja = d.hoja.replace(/[\[\]:*?\/\\]/g, '-').slice(0, 31);
    var NS = 'http://schemas.openxmlformats.org/';
    var XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var enc = new TextEncoder();
    var archivos = [
      ['[Content_Types].xml', XML + '<Types xmlns="' + NS + 'package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>'],
      ['_rels/.rels', XML + '<Relationships xmlns="' + NS + 'package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + NS + 'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'],
      ['xl/workbook.xml', XML + '<workbook xmlns="' + NS + 'spreadsheetml/2006/main" xmlns:r="' + NS + 'officeDocument/2006/relationships">' +
        '<sheets><sheet name="' + xmlEsc(hoja) + '" sheetId="1" r:id="rId1"/></sheets>' +
        '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'' +
        xmlEsc(hoja) + '\'!' + rango.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2') + '</definedName></definedNames>' +
        '</workbook>'],
      ['xl/_rels/workbook.xml.rels', XML + '<Relationships xmlns="' + NS + 'package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + NS + 'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="' + NS + 'officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'],
      ['xl/styles.xml', XML + '<styleSheet xmlns="' + NS + 'spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F3F6"/><bgColor indexed="64"/></patternFill></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>'],
      ['xl/worksheets/sheet1.xml', XML + '<worksheet xmlns="' + NS + 'spreadsheetml/2006/main">' +
        // Cabecera fija: al bajar por la hoja, los títulos de columna no se van.
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
        '<cols>' + anchos.map(function(w, i){
          return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
        }).join('') + '</cols>' +
        '<sheetData>' + filas.join('') + '</sheetData>' +
        '<autoFilter ref="' + rango + '"/>' +
        '</worksheet>']
    ].map(function(a){ return { nombre: a[0], datos: enc.encode(a[1]) }; });
    guardarArchivo(zip(archivos, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), d.archivo + '.xlsx');
  }

  // Zip sin compresión (método «store»): basta para un .xlsx y sólo exige
  // calcular el CRC-32 de cada archivo.
  var TABLA_CRC = (function(){
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(b){
    var c = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(archivos, tipo){
    var enc = new TextEncoder(), partes = [], central = [], desplazamiento = 0;
    var ahora = new Date();
    var hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
    var dia = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    archivos.forEach(function(a){
      var nombre = enc.encode(a.nombre), datos = a.datos, crc = crc32(datos);
      var loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
      loc.setUint16(8, 0, true); loc.setUint16(10, hora, true); loc.setUint16(12, dia, true);
      loc.setUint32(14, crc, true); loc.setUint32(18, datos.length, true); loc.setUint32(22, datos.length, true);
      loc.setUint16(26, nombre.length, true); loc.setUint16(28, 0, true);
      partes.push(new Uint8Array(loc.buffer), nombre, datos);
      var cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true); cen.setUint16(12, hora, true);
      cen.setUint16(14, dia, true); cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true);
      cen.setUint32(24, datos.length, true); cen.setUint16(28, nombre.length, true);
      cen.setUint32(42, desplazamiento, true);
      central.push(new Uint8Array(cen.buffer), nombre);
      desplazamiento += 30 + nombre.length + datos.length;
    });
    var tamCentral = central.reduce(function(s, p){ return s + p.length; }, 0);
    var fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true);
    fin.setUint16(10, archivos.length, true); fin.setUint32(12, tamCentral, true);
    fin.setUint32(16, desplazamiento, true);
    return new Blob(partes.concat(central, [new Uint8Array(fin.buffer)]), { type: tipo });
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  // Escrito a mano con la Helvetica que todo lector de PDF trae de serie, así
  // que no hay que incrustar ninguna fuente. Hoja A4 apaisada; la letra se
  // reduce lo justo para que quepan todas las columnas y, si aun así no
  // caben, las más anchas se recortan con «…».
  var ANCHOS_HELVETICA = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,
    611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,
    278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,
    333,500,278,556,500,722,500,500,500,334,260,334,584];
  var ANCHOS_EXTRA = { '€': 556, '…': 1000, '·': 278, '¿': 611, '¡': 333, 'ª': 370, 'º': 365, '°': 400 };

  function anchoCaracter(ch){
    var c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) return ANCHOS_HELVETICA[c - 32];
    if (ANCHOS_EXTRA[ch]) return ANCHOS_EXTRA[ch];
    // Las letras acentuadas miden como su letra base, salvo la í, más ancha que la i.
    var base = ch.normalize('NFD').charAt(0), b = base.charCodeAt(0);
    if (base !== ch && b >= 32 && b <= 126) return b === 105 ? 278 : ANCHOS_HELVETICA[b - 32];
    return 556;
  }

  function anchoTexto(s, tam, negrita){
    var w = 0;
    for (var i = 0; i < s.length; i++) w += anchoCaracter(s.charAt(i));
    return w * tam / 1000 * (negrita ? 1.07 : 1);
  }

  function recortar(s, max, tam, negrita){
    s = String(s);
    if (anchoTexto(s, tam, negrita) <= max) return s;
    while (s.length && anchoTexto(s + '…', tam, negrita) > max) s = s.slice(0, -1);
    return s + '…';
  }

  // Cadena PDF en WinAnsi. Lo que no es ASCII va escrito en octal: así el
  // archivo entero es ASCII y los desplazamientos de la tabla xref cuadran.
  var WINANSI = { '€': 128, '…': 133, '‘': 145, '’': 146, '“': 147, '”': 148, '–': 150, '—': 151 };
  function cadenaPdf(s){
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i), c = ch.charCodeAt(0);
      if (WINANSI[ch]) c = WINANSI[ch];
      else if (c > 255 || (c > 126 && c < 160)) c = 63;
      if (c === 40 || c === 41 || c === 92) out += '\\' + String.fromCharCode(c);
      else if (c < 32 || c > 126) out += '\\' + ('00' + c.toString(8)).slice(-3);
      else out += String.fromCharCode(c);
    }
    return '(' + out + ')';
  }

  function num(n){ return String(Math.round(n * 100) / 100); }
  function suma(a){ return a.reduce(function(s, x){ return s + x; }, 0); }

  // Tope común para las columnas anchas: las estrechas conservan su ancho y
  // las demás se igualan a lo que quede libre.
  function tope(anchos, util){
    var orden = anchos.slice().sort(function(a, b){ return a - b; }), acumulado = 0;
    for (var i = 0; i < orden.length; i++) {
      var t = (util - acumulado) / (orden.length - i);
      if (orden[i] >= t) return t;
      acumulado += orden[i];
    }
    return Infinity;
  }

  function descargarPDF(d){
    var m = matriz(d).map(function(f){ return f.map(String); });
    var W = 842, H = 595, MARGEN = 28, PAD = 4, util = W - 2 * MARGEN;
    function naturales(tam){
      return d.cols.map(function(c, i){
        var w = anchoTexto(c.t.toUpperCase(), tam * 0.85, true);
        m.forEach(function(f){ w = Math.max(w, anchoTexto(f[i], tam)); });
        return w + 2 * PAD;
      });
    }
    var tam = 8, anchos = naturales(tam), total = suma(anchos);
    if (total > util) { tam = Math.max(5.5, tam * util / total); anchos = naturales(tam); total = suma(anchos); }
    if (total > util) {
      var t = tope(anchos, util);
      anchos = anchos.map(function(w){ return Math.min(w, t); });
    } else {
      var extra = (util - total) / anchos.length;
      anchos = anchos.map(function(w){ return w + extra; });
    }

    var alto = tam * 2.2, arriba = H - MARGEN - 24;
    var porPagina = Math.max(1, Math.floor((arriba - alto - MARGEN - 8) / alto));
    var paginas = [];
    for (var p = 0; p === 0 || p * porPagina < m.length; p++) paginas.push(m.slice(p * porPagina, (p + 1) * porPagina));

    var resumen = d.filas.length + (d.filas.length === 1 ? ' fila' : ' filas') +
      (d.filas.length !== d.total ? ' de ' + d.total + ' (con búsqueda o filtro)' : '') +
      ' · ' + fecha(new Date().toISOString());

    var flujos = paginas.map(function(filas, p){
      var o = [], y = arriba, x;
      o.push('BT /F2 12 Tf ' + MARGEN + ' ' + (H - MARGEN - 10) + ' Td ' + cadenaPdf('Balonmano Vetusta · ' + d.titulo) + ' Tj ET');
      o.push('BT /F1 8 Tf ' + num(W - MARGEN - anchoTexto(resumen, 8)) + ' ' + (H - MARGEN - 10) + ' Td ' + cadenaPdf(resumen) + ' Tj ET');
      o.push('0.945 0.953 0.965 rg ' + MARGEN + ' ' + num(y - alto) + ' ' + util + ' ' + num(alto) + ' re f 0 g');
      x = MARGEN;
      d.cols.forEach(function(c, i){
        o.push('BT /F2 ' + num(tam * 0.85) + ' Tf ' + num(x + PAD) + ' ' + num(y - alto * 0.64) + ' Td ' +
          cadenaPdf(recortar(c.t.toUpperCase(), anchos[i] - 2 * PAD, tam * 0.85, true)) + ' Tj ET');
        x += anchos[i];
      });
      y -= alto;
      o.push('0.85 G 0.4 w');
      filas.forEach(function(f){
        x = MARGEN;
        f.forEach(function(v, i){
          if (v !== '') {
            o.push('BT /F1 ' + num(tam) + ' Tf ' + num(x + PAD) + ' ' + num(y - alto * 0.64) + ' Td ' +
              cadenaPdf(recortar(v, anchos[i] - 2 * PAD, tam)) + ' Tj ET');
          }
          x += anchos[i];
        });
        y -= alto;
        o.push(MARGEN + ' ' + num(y) + ' m ' + (MARGEN + util) + ' ' + num(y) + ' l S');
      });
      var pie = 'Página ' + (p + 1) + ' de ' + paginas.length;
      o.push('BT /F1 7 Tf ' + num(W - MARGEN - anchoTexto(pie, 7)) + ' ' + (MARGEN - 12) + ' Td ' + cadenaPdf(pie) + ' Tj ET');
      return o.join('\n');
    });

    // Objetos: 1 catálogo, 2 páginas, 3 y 4 fuentes, y luego página + contenido de cada hoja.
    var objetos = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    ];
    var hijos = [];
    flujos.forEach(function(s){
      var nPagina = objetos.length + 1;
      objetos.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] ' +
        '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (nPagina + 1) + ' 0 R >>');
      objetos.push('<< /Length ' + s.length + ' >>\nstream\n' + s + '\nendstream');
      hijos.push(nPagina + ' 0 R');
    });
    objetos[1] = '<< /Type /Pages /Kids [' + hijos.join(' ') + '] /Count ' + hijos.length + ' >>';

    var pdf = '%PDF-1.4\n', posiciones = [];
    objetos.forEach(function(o, i){
      posiciones.push(pdf.length);
      pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n';
    });
    var xref = pdf.length;
    pdf += 'xref\n0 ' + (objetos.length + 1) + '\n0000000000 65535 f \n' +
      posiciones.map(function(n){ return ('0000000000' + n).slice(-10) + ' 00000 n \n'; }).join('') +
      'trailer\n<< /Size ' + (objetos.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    guardarArchivo(new Blob([pdf], { type: 'application/pdf' }), d.archivo + '.pdf');
  }

  // ── Ventana de elección ───────────────────────────────────────────────────
  var ventana = document.getElementById('descarga');

  function abrirDescarga(){
    var d = tablaDescarga();
    var que = d.titulo + ' · ' + d.filas.length + (d.filas.length === 1 ? ' fila' : ' filas');
    if (d.filas.length !== d.total) que += ' de ' + d.total + '. Se descarga lo que ves con la búsqueda o el filtro.';
    document.getElementById('descarga-que').textContent = que;
    if (ventana.showModal) ventana.showModal(); else ventana.setAttribute('open', '');
  }

  function cerrarDescarga(){ if (ventana.close) ventana.close(); else ventana.removeAttribute('open'); }

  document.getElementById('descargar').addEventListener('click', abrirDescarga);
  document.getElementById('descarga-cancelar').addEventListener('click', cerrarDescarga);
  // Un clic fuera de la caja (sobre el fondo oscuro) también la cierra.
  ventana.addEventListener('click', function(e){ if (e.target === ventana) cerrarDescarga(); });
  document.querySelectorAll('[data-formato]').forEach(function(b){
    b.addEventListener('click', function(){
      var d = tablaDescarga();
      cerrarDescarga();
      ({ csv: descargarCSV, excel: descargarExcel, pdf: descargarPDF })[b.dataset.formato](d);
    });
  });
`;
