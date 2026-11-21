#!/usr/bin/env python3
"""
escudos.py — miniaturas PNG de los escudos de la federación.

La federación sirve los escudos de los clubes en JPG enormes (hasta 3.000 px
y 1 MB) y la web los pinta a 18–40 px. Este script busca en data/ todas las
URL de escudos (images/afiliacion_clubs/...), descarga las que aún no tienen
miniatura, les quita el fondo blanco o negro, las recorta, las deja cuadradas
y las guarda en src/assets/escudos/ a 96 px, en dos versiones:

  <club>_<archivo>.png  sin fondo, para la tira blanca de partidos de la
                        semana;
  <club>_<archivo>.jpg  con su fondo original, para los paneles oscuros de
                        la liga (clasificación, próximos, resultados): sin
                        fondo, los escudos con letras o líneas oscuras no se
                        verían sobre el negro.

La web deduce el nombre de la miniatura a partir de la URL original
(script.js, escudoLocal) y, si no existe, usa la original.

Uso:  python3 scripts/escudos.py            # sólo las que faltan
      python3 scripts/escudos.py --forzar   # todas otra vez
Requiere Pillow y numpy. Lo ejecuta la Action de GitHub después de
fetch-data.js, así los escudos nuevos tienen miniatura en el día.
"""

import glob
import io
import json
import os
import re
import sys
import urllib.request
from collections import deque

import numpy as np
from PIL import Image, ImageOps

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATOS = os.path.join(RAIZ, 'data')
SALIDA = os.path.join(RAIZ, 'src', 'assets', 'escudos')
LADO = 96            # tamaño final: 2–3 veces el mayor en que se pinta
TRABAJO = 400        # tamaño al que se procesa (los originales grandes se reducen antes)
PATRON = re.compile(r'^https://balonmano\.isquad\.es/images/afiliacion_clubs/(\d+)/(?:square_)?(\w+)\.(?:jpe?g|png|gif|webp)$', re.I)

# Mismos umbrales que sinFondo() de la imagen para redes (grafica-panel.js).
DURO, SUAVE, HOLGURA = 38, 140, 3


def nombre(url):
    m = PATRON.match(url)
    return f'{m.group(1)}_{m.group(2)}' if m else None


def urls_en_datos():
    vistas = set()
    for f in glob.glob(os.path.join(DATOS, '**', '*.json'), recursive=True):
        with open(f, encoding='utf-8') as fh:
            texto = fh.read()
        for u in re.findall(r'https://balonmano\.isquad\.es/images/afiliacion_clubs/[^"\\]+', texto):
            if PATRON.match(u):
                vistas.add(u)
    return sorted(vistas)


def bajar(url):
    pet = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (escudos BM Vetusta)'})
    with urllib.request.urlopen(pet, timeout=30) as r:
        return r.read()


def anillo(h, w, t):
    """Máscara de los píxeles a distancia t del borde."""
    m = np.zeros((h, w), bool)
    m[t, t:w - t] = m[h - 1 - t, t:w - t] = True
    m[t:h - t, t] = m[t:h - t, w - 1 - t] = True
    return m


def erosionar(m):
    """Erosión 8-vecinos; lo de fuera de la imagen cuenta como relleno."""
    p = np.pad(m, 1, constant_values=True)
    r = p[1:-1, 1:-1].copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy or dx:
                r &= p[1 + dy:p.shape[0] - 1 + dy, 1 + dx:p.shape[1] - 1 + dx]
    return r


def vecinos8(y, x, h, w):
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if (dy or dx) and 0 <= y + dy < h and 0 <= x + dx < w:
                yield y + dy, x + dx


def sin_fondo(im):
    """Quita el fondo liso (blanco o negro) entrando desde los bordes; el
    blanco de dentro del escudo se queda. Si el fondo no es liso, devuelve la
    imagen como viene. Una imagen que ya trae transparencia sólo se recorta."""
    a = np.asarray(im.convert('RGBA')).astype(np.int16)
    h, w = a.shape[:2]
    alfa = a[..., 3]
    borde0 = anillo(h, w, 0)
    if (alfa[borde0] < 250).any() or h <= 8 or w <= 8:
        return im.convert('RGBA')
    rgb = a[..., :3]
    d_blanco = 255 - rgb.min(axis=2)
    d_negro = rgb.max(axis=2)
    tipo = np.zeros((h, w), np.uint8)
    tipo[d_blanco < DURO] = 1
    tipo[(tipo == 0) & (d_negro < DURO)] = 2
    # Los dos píxeles del borde son marco (3): se quitan siempre.
    fondo = np.zeros((h, w), np.uint8)
    marco = borde0 | anillo(h, w, 1)
    fondo[marco] = 3
    # Lejos del escudo: candidatos a fondo a más de HOLGURA píxeles de lo que
    # no lo es; el relleno sólo avanza por ahí para no colarse por rendijas.
    lejos = (tipo > 0) | marco
    for _ in range(HOLGURA):
        lejos = erosionar(lejos)
    borde2 = anillo(h, w, 2)
    ys, xs = np.nonzero(borde2 & (tipo > 0))
    if len(ys) < borde2.sum() * 0.6:
        return im.convert('RGBA')
    cola = deque()
    for y, x in zip(ys, xs):
        if lejos[y, x]:
            fondo[y, x] = tipo[y, x]
            cola.append((y, x))
    while cola:
        y, x = cola.popleft()
        t = fondo[y, x]
        for j in vecinos8(y, x, h, w):
            if not fondo[j] and tipo[j] == t and lejos[j]:
                fondo[j] = t
                cola.append(j)
    # Crece HOLGURA píxeles para llegar hasta el borde del escudo.
    for _ in range(HOLGURA):
        nuevo = []
        ys, xs = np.nonzero((fondo == 1) | (fondo == 2))
        for y, x in zip(ys, xs):
            t = fondo[y, x]
            for j in vecinos8(y, x, h, w):
                if not fondo[j] and tipo[j] == t:
                    nuevo.append((j, t))
        for j, t in nuevo:
            fondo[j] = t
    if (fondo > 0).sum() > h * w * 0.9:
        return im.convert('RGBA')
    salida = a.copy()
    salida[..., 3][fondo > 0] = 0
    # El filo entre escudo y fondo se funde: transparencia parcial y sin el
    # tinte del fondo, para que no quede halo.
    p = np.pad(fondo, 1)
    for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        junto = p[1 + dy:h + 1 + dy, 1 + dx:w + 1 + dx]
        filo = (fondo == 0) & ((junto == 1) | (junto == 2)) & (salida[..., 3] == 255)
        for t, dist in ((1, d_blanco), (2, d_negro)):
            m = filo & (junto == t) & (dist < SUAVE)
            if not m.any():
                continue
            al = np.clip((dist[m] - DURO) / (SUAVE - DURO), 0.05, 1.0)
            for c in range(3):
                v = salida[..., c][m].astype(float)
                v = 255 - (255 - v) / al if t == 1 else v / al
                salida[..., c][m] = np.clip(np.round(v), 0, 255)
            salida[..., 3][m] = np.round(255 * al)
    return Image.fromarray(salida.astype(np.uint8), 'RGBA')


def abrir(datos):
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(datos)))
    im = im.convert('RGBA')
    if max(im.size) > TRABAJO:
        r = TRABAJO / max(im.size)
        im = im.resize((max(1, round(im.width * r)), max(1, round(im.height * r))), Image.LANCZOS)
    return im


def con_fondo(im):
    """La imagen tal cual (con su fondo), cuadrada y a LADO px, en JPG."""
    fondo = Image.new('RGB', im.size, (255, 255, 255))
    fondo.paste(im, mask=im.getchannel('A'))
    lado = max(fondo.size)
    cuadro = Image.new('RGB', (lado, lado), fondo.getpixel((0, 0)))
    cuadro.paste(fondo, ((lado - fondo.width) // 2, (lado - fondo.height) // 2))
    return cuadro.resize((LADO, LADO), Image.LANCZOS)


def miniatura(im):
    im = sin_fondo(im)
    caja = im.getchannel('A').point(lambda v: 255 if v >= 24 else 0).getbbox()
    if caja:
        im = im.crop(caja)
    lado = max(im.size)
    cuadro = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    cuadro.paste(im, ((lado - im.width) // 2, (lado - im.height) // 2))
    # Reducción premultiplicada (RGBa) para que el filo no se oscurezca.
    return cuadro.convert('RGBa').resize((LADO, LADO), Image.LANCZOS).convert('RGBA')


def main():
    forzar = '--forzar' in sys.argv
    os.makedirs(SALIDA, exist_ok=True)
    urls = urls_en_datos()
    hechas = fallos = 0
    for u in urls:
        base = os.path.join(SALIDA, nombre(u))
        png, jpg = base + '.png', base + '.jpg'
        if os.path.exists(png) and os.path.exists(jpg) and not forzar:
            continue
        try:
            im = abrir(bajar(u))
            miniatura(im).save(png, optimize=True)
            con_fondo(im).save(jpg, quality=88, optimize=True, progressive=True)
            hechas += 1
        except Exception as e:  # un escudo que falle no para el resto
            fallos += 1
            print(f'   ⚠ {u}: {e}')
    print(f'Escudos: {len(urls)} en los datos · {hechas} miniaturas nuevas · {fallos} fallos')


if __name__ == '__main__':
    main()
