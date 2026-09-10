# Altas de abonado/a · Cloudflare Worker

Recibe el formulario de `https://balonmanovetusta.com/abonate/alta.html`, valida
los datos, los guarda en una base de datos D1 y avisa por correo. Todo dentro de
la cuenta de Cloudflare del club: no interviene ningún tercero salvo, si se
activa, el proveedor de envío de correo.

## Qué hace

| Ruta | Método | Para qué |
|---|---|---|
| `/alta` | POST | Alta nueva. Devuelve `{ ok: true, numero, socios }` |
| `/admin` | GET | **Panel de abonados**: listado, marcar pagos y descargar CSV |
| `/admin/login` | POST | Comprueba la clave y devuelve una sesión firmada |
| `/admin/datos` | GET | Listado en JSON. Requiere sesión |
| `/admin/pagado` | POST | Marca un alta como pagada. Requiere sesión |
| `/export.csv` | GET | CSV. Requiere clave o sesión |
| `/` | GET | Comprobación de vida |

## El panel de abonados

Está en **https://altas.balonmanovetusta.com/admin** y se entra con el
`ADMIN_TOKEN`. Muestra el listado completo, un resumen de altas, pagos y
euros, un buscador, un filtro de pendientes, un botón por fila para marcar
el pago y la descarga del CSV.

**Por qué el repositorio no da acceso.** La página la sirve el Worker, no
GitHub Pages, y este repositorio contiene sólo su código, sin credenciales:
la clave vive cifrada en los secretos de Cloudflare y la comprobación ocurre
en el servidor. Clonar el repositorio no permite entrar ni leer un solo dato.

Las defensas concretas:

- **La sesión es un testigo firmado con HMAC-SHA256**, `caducidad.firma`, que
  caduca a las 8 horas. No se guarda nada en servidor y no se puede falsificar
  sin el secreto.
- **Viaja en la cabecera `Authorization`, no en una cookie**, así que no hay
  superficie para CSRF: un sitio ajeno no puede añadir cabeceras ni leer el
  `sessionStorage` de otro origen.
- **La clave se compara en tiempo constante**, para que el tiempo de respuesta
  no revele cuántos caracteres son correctos.
- **Ocho intentos FALLIDOS de acceso por hora y IP.** Sólo se apuntan los
  fallos y un acierto borra el contador, así que usar el panel con normalidad
  nunca te deja fuera.
- **Sin recursos externos** y con una `Content-Security-Policy` que sólo
  permite conexiones al propio origen.
- **`no-store` y `noindex`**: no queda en caché ni en buscadores.

Si la clave se filtrase, se cambia en diez segundos y **todas las sesiones
abiertas quedan invalidadas de inmediato**, porque la firma se deriva de ella:

```bash
wrangler secret put ADMIN_TOKEN
```

El **número de abonado/a** es el `id` autoincremental de la base de datos, así
que se asigna solo: es el campo que en la ficha de papel quedaba «a rellenar por
el club». La numeración arranca en el **101**.

## Un socio por persona

Un abono Matrimonio o Familiar da de alta a **varias personas y cada una es un
socio con su propio número**. En la base de datos eso son varias filas:

- La del **titular** lleva `titular_id` NULL, `parentesco` «Titular» y el
  **importe completo** del abono.
- Cada persona incluida lleva `titular_id` con el número del titular, su
  `parentesco` (Pareja, Hijo, Hija…) e **importe 0**, porque la cuota se paga
  una sola vez. Hereda teléfono, correo, localidad y consentimientos.

Consecuencias prácticas:

- Un DNI repetido dentro del mismo abono se rechaza (`dni_repetido`), y los
  DNI se comprueban **todos antes de insertar nada**; si algo falla a mitad, se
  borra el grupo entero para no dejar un abono partido.
- Marcar el pago afecta a **todo el grupo**: el panel resuelve
  `COALESCE(titular_id, id)` y actualiza titular e incluidas de una vez.
- El panel ordena por abono y muestra las personas incluidas indentadas bajo su
  titular. Los euros se cuentan **sólo en los titulares**, así que «Cobrado» y
  «Comprometido» no se duplican.

## Despliegue

```bash
npm install -g wrangler
wrangler login

# 1. Base de datos
wrangler d1 create bmvetusta-abonados
#    → copia el database_id que imprime en wrangler.toml

wrangler d1 execute bmvetusta-abonados --remote --file=./schema.sql

# 2. Secretos (no van en wrangler.toml, se guardan cifrados)
wrangler secret put ADMIN_TOKEN      # contraseña larga, para /export.csv
wrangler secret put IBAN             # IBAN del club, para el correo de confirmación
wrangler secret put RESEND_API_KEY   # opcional: sin él no se envían correos

# 3. Publicar
wrangler deploy
```

Después, en el panel de Cloudflare, añade una **ruta personalizada** para que el
Worker responda en `altas.balonmanovetusta.com`, que es la dirección a la que
apunta `abonate/alta.js`. Si prefieres otra, cámbiala en ese archivo.

## Correos

El envío es **opcional**. Sin `RESEND_API_KEY` el alta se guarda igual y no se
manda nada; conviene activarlo para no tener que vigilar el CSV.

Con la clave puesta se envían dos correos por alta: el aviso al club con todos
los datos y la confirmación al socio con su número y las instrucciones de la
transferencia. El remitente (`AVISO_DE` en `wrangler.toml`) debe ser un dominio
verificado en el proveedor.

Si preferís otro proveedor, la única función que hay que cambiar es
`enviarCorreo`.

## Consultar las altas

```bash
# Todas, en CSV. Mejor por cabecera: así el token no queda en los registros
# del servidor ni en el historial del navegador.
curl -o abonados.csv -H "Authorization: Bearer EL_TOKEN" \
  https://altas.balonmanovetusta.com/export.csv

# Marcar una transferencia como recibida
wrangler d1 execute bmvetusta-abonados --remote \
  --command "UPDATE abonados SET pagado = 1 WHERE id = 12"

# Cuántas altas y cuánto dinero, por modalidad
wrangler d1 execute bmvetusta-abonados --remote \
  --command "SELECT modalidad, COUNT(*) n, SUM(importe) euros FROM abonados GROUP BY modalidad"
```

## Decisiones que conviene conocer

- **La validación está repetida** en el navegador y en el Worker. El navegador
  se puede saltar, así que el Worker no da nada por bueno: comprueba la letra
  del DNI, que la modalidad cuadre con la edad, que un menor traiga tutor y que
  Matrimonio y Familiar traigan a la segunda persona adulta.
- **El precio lo pone el servidor**, nunca el formulario, para que no se pueda
  manipular.
- **Un DNI no puede repetirse** en la misma temporada: hay un índice único y la
  ruta devuelve 409, que el formulario traduce a un mensaje claro.
- **Los correos no pueden tumbar un alta**: se envían después de guardar y sus
  errores se ignoran.
- **Sólo se aceptan envíos** desde los orígenes de `ORIGENES`.
- **Campo trampa**: el formulario lleva un campo oculto `web`; si llega
  rellenado, el Worker responde 200 y descarta el envío sin guardar nada.
- **CORS no autentica.** Cualquiera puede enviar la cabecera `Origin` que
  quiera desde fuera de un navegador, así que lo que de verdad contiene el
  abuso es el **límite por IP**: 15 altas por hora, y 10 descargas fallidas
  por hora. En las altas se cuentan también los aciertos, porque es un
  endpoint de escritura abierto; el tope es holgado para que una cola de gente
  apuntándose desde la wifi del pabellón no se bloquee. Se cuenta sobre un
  **hash** de la IP, no sobre la IP, y las filas se borran a las 24 horas.

  Si alguna vez hay que desbloquear a alguien:
  `wrangler d1 execute bmvetusta-abonados --remote --command "DELETE FROM limites"`
- **El token se compara en tiempo constante**, para que el tiempo de respuesta
  no revele cuántos caracteres son correctos.
