# Altas de abonado/a · Cloudflare Worker

Recibe el formulario de `https://balonmanovetusta.com/abonate/alta.html`, valida
los datos, los guarda en una base de datos D1 y avisa por correo. Todo dentro de
la cuenta de Cloudflare del club: no interviene ningún tercero salvo, si se
activa, el proveedor de envío de correo.

## Qué hace

| Ruta | Método | Para qué |
|---|---|---|
| `/alta` | POST | Alta nueva. Devuelve `{ ok: true, numero }` |
| `/export.csv?token=…` | GET | Descarga todas las altas en CSV |
| `/` | GET | Comprobación de vida |

El **número de abonado/a** es el `id` autoincremental de la base de datos, así
que se asigna solo: es el campo que en la ficha de papel quedaba «a rellenar por
el club».

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
# Todas, en CSV
curl -o abonados.csv "https://altas.balonmanovetusta.com/export.csv?token=EL_TOKEN"

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
