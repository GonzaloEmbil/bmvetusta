// Correo de confirmación del alta.
//
// Se construye una sola vez y sale en dos versiones, que van juntas en el mismo
// envío: el HTML, que es lo que ve casi todo el mundo, y el texto plano, que
// usan los clientes con el HTML desactivado y que además ayuda a que el correo
// no acabe en spam.
//
// El HTML está escrito con las reglas del correo, no de la web:
//   · Maquetación con <table>, porque Outlook no entiende flex ni grid.
//   · Estilos en línea, porque Gmail descarta buena parte de lo que va en un
//     <style> del <head>.
//   · Ancho fijo de 600px, el máximo seguro en clientes de escritorio.
//   · Todo tiene que seguir leyéndose si el cliente bloquea las imágenes, que
//     es el ajuste por defecto en muchos: de ahí que el escudo lleve alt y que
//     ningún dato viva dentro de una imagen.

const NEGRO = '#14161a';
const AMARILLO = '#FDED3A';
const TINTA_2 = '#4a5058';
const TINTA_3 = '#7b828b';
const LINEA = '#e2e5ea';
const FONDO = '#f4f4f5';

const TIPO = "Arial, Helvetica, sans-serif";
const MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

const ESCUDO = 'https://balonmanovetusta.com/src/assets/escudo.png';
const WEB = 'https://balonmanovetusta.com';
const CONDICIONES = 'https://balonmanovetusta.com/abonate/condiciones/';

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

// ── Piezas del HTML ────────────────────────────────────────────────────────

function parrafo(html, extra = '') {
  return `<p style="margin:0 0 16px;font-family:${TIPO};font-size:15px;line-height:1.6;color:${NEGRO};${extra}">${html}</p>`;
}

// Cada dato va con la etiqueta encima y el valor debajo, no en dos columnas.
// En dos columnas, con el valor a la derecha, un IBAN o un concepto largo se
// parten a mitad de pantalla estrecha y quedan ilegibles; y no se puede
// arreglar con una media query porque Outlook las ignora. Así aguanta cualquier
// ancho sin condiciones.
//
// datos es un array de [etiqueta, valor, ¿monoespaciada?].
function caja(datos, titulo) {
  const filas = datos.map(([clave, valor, mono], i) => `<tr>
    <td style="padding:${i ? '12px' : '0'} 0 0;${i ? `border-top:1px solid ${LINEA};` : ''}">
      <div style="font-family:${TIPO};font-size:12px;line-height:1.4;color:${TINTA_3};padding-bottom:3px">${esc(clave)}</div>
      <div style="font-family:${mono ? MONO : TIPO};font-size:${mono ? '15px' : '16px'};line-height:1.4;font-weight:bold;color:${NEGRO};word-break:break-word;padding-bottom:${i === datos.length - 1 ? '0' : '12px'}">${esc(valor)}</div>
    </td>
  </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${LINEA};border-radius:10px;margin:0 0 22px">
    <tr><td style="padding:18px 20px">
      ${titulo ? `<p style="margin:0 0 14px;font-family:${TIPO};font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:${TINTA_3}">${esc(titulo)}</p>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${filas}</table>
    </td></tr>
  </table>`;
}

// El número de socio es el dato que la gente busca al abrir el correo, así que
// va en un bloque propio, en grande y sobre el amarillo del club.
function bloqueNumero(socios, numero) {
  let dentro;
  if (socios.length > 1) {
    dentro = `<p style="margin:0 0 12px;font-family:${TIPO};font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:${NEGRO}">Números de abonado/a de este abono</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">` +
      socios.map((s) => `<tr>
        <td style="padding:4px 0;font-family:${TIPO};font-size:24px;font-weight:bold;line-height:1.2;color:${NEGRO};white-space:nowrap;vertical-align:middle">${esc(s.numero)}</td>
        <td style="padding:4px 0 4px 14px;font-family:${TIPO};font-size:14px;line-height:1.35;color:${NEGRO};vertical-align:middle">${esc(s.nombre)}<br><span style="font-size:12px;color:#5a5c33">${esc(s.parentesco)}</span></td>
      </tr>`).join('') + '</table>';
  } else {
    dentro = `<p style="margin:0 0 4px;font-family:${TIPO};font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:${NEGRO}">Tu número de abonado/a</p>
      <p style="margin:0;font-family:${TIPO};font-size:40px;font-weight:bold;line-height:1.1;color:${NEGRO}">${esc(numero)}</p>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${AMARILLO};border-radius:10px;margin:0 0 22px">
    <tr><td style="padding:20px 22px">${dentro}</td></tr>
  </table>`;
}

// ── El correo ──────────────────────────────────────────────────────────────

export function correoAlta({ fila: d, socios, numero, temporada, iban }) {
  const modalidad = `${d.modalidad} (${d.importe} €)`;
  const concepto = `${d.nombre} - Abono ${d.modalidad}`;
  const presencial = d.pago === 'Presencial';

  const carnet = '¡Puedes recoger tu carnet de abonado en el Florida Arena en cualquier partido del primer equipo del Balonmano Vetusta!';
  const gracias = 'Muchas gracias, ¡te esperamos en el Florida Arena!';

  // ── Texto plano ──
  const T = [
    `Hola ${d.nombre}:`,
    '',
    `Hemos recibido tu solicitud de alta como abonado/a para la temporada ${temporada}.`,
    '',
    `Modalidad: ${modalidad}`,
  ];
  if (socios.length > 1) {
    T.push('Números de abonado/a de este abono:');
    socios.forEach((s) => T.push(`  Nº ${s.numero} · ${s.nombre} (${s.parentesco})`));
  } else {
    T.push(`Tu número de abonado/a es el ${numero}.`);
  }
  T.push('');
  if (presencial) {
    T.push(`Puedes pagar los ${d.importe} € en el Florida Arena cualquier día que el Balonmano Vetusta juegue como local.`);
  } else {
    T.push(
      'Datos para la transferencia:',
      `  Importe: ${d.importe} €`,
      '  Destinatario: Club Balonmano Vetusta',
      `  IBAN: ${iban}`,
      `  Concepto: ${concepto}`
    );
  }
  T.push('', carnet, '', gracias, '', 'Balonmano Vetusta');

  // ── HTML ──
  const pago = presencial
    ? caja([
        ['Importe', `${d.importe} €`],
        ['Dónde', 'Florida Arena'],
        ['Cuándo', 'Cualquier partido del Balonmano Vetusta como local'],
      ], 'Pago en el Florida Arena')
    : caja([
        ['Importe', `${d.importe} €`],
        ['Destinatario', 'Club Balonmano Vetusta'],
        ['IBAN', iban, true],
        ['Concepto', concepto],
      ], 'Datos para la transferencia');

  const cuerpo = `
    ${parrafo(`Hola <strong>${esc(d.nombre)}</strong>:`)}
    ${parrafo(`Hemos recibido tu solicitud de alta como abonado/a para la temporada <strong>${esc(temporada)}</strong>.`)}
    ${caja([
      ['Modalidad', modalidad],
      ['Forma de pago', presencial ? 'En el Florida Arena' : 'Transferencia bancaria'],
    ])}
    ${bloqueNumero(socios, numero)}
    ${pago}
    ${parrafo(esc(carnet))}
    ${parrafo(esc(gracias))}
    ${parrafo('Balonmano Vetusta', `color:${TINTA_2};margin-bottom:0`)}
  `;

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alta de abonado/a</title></head>
<body style="margin:0;padding:0;background:${FONDO};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${FONDO}">
  <tr><td align="center" style="padding:26px 12px">

    <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <!-- El ancho se declara como width:100% + max-width y NO con el atributo
         width="600": con el atributo, la tabla no se encoge y el correo se sale
         de la pantalla en el móvil. Outlook, que ignora max-width, se apaña con
         la tabla del comentario condicional de arriba. -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">

      <!-- Cabecera. El escudo lleva alt porque muchos clientes bloquean las
           imágenes, y el nombre del club va en texto, no dentro de la imagen. -->
      <tr><td style="background:${NEGRO};padding:22px 26px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
          <tr>
            <td style="vertical-align:middle"><img src="${ESCUDO}" width="46" height="46" alt="Balonmano Vetusta" style="display:block;width:46px;height:46px;border:0"></td>
            <td style="padding-left:14px;vertical-align:middle">
              <div style="font-family:${TIPO};font-size:16px;font-weight:bold;letter-spacing:0.5px;color:#ffffff;line-height:1.2">BALONMANO VETUSTA</div>
              <div style="font-family:${TIPO};font-size:11px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:${AMARILLO};line-height:1.4">Campaña de abonados ${esc(temporada)}</div>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:28px 26px 24px">${cuerpo}</td></tr>

      <tr><td style="border-top:1px solid ${LINEA};padding:18px 26px 22px">
        <p style="margin:0 0 6px;font-family:${TIPO};font-size:11px;line-height:1.6;color:${TINTA_3}">
          CDB Club Balonmano Vetusta · CIF G74174277 · El Llano 11, Naranco · 33194 Oviedo
        </p>
        <p style="margin:0;font-family:${TIPO};font-size:11px;line-height:1.6;color:${TINTA_3}">
          <a href="${CONDICIONES}" style="color:${TINTA_2}">Condiciones del abono y protección de datos</a>
          &nbsp;·&nbsp;
          <a href="${WEB}" style="color:${TINTA_2}">balonmanovetusta.com</a>
        </p>
      </td></tr>

    </table>
    <!--[if mso]></td></tr></table><![endif]-->

  </td></tr>
</table>
</body></html>`;

  return { texto: T.join('\n'), html };
}
