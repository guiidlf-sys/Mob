#!/usr/bin/env python3
"""Régénère docs/icon.png — le « M » de l'écran d'accueil.

Écrit le PNG à la main (zlib + struct) : aucune dépendance tierce, comme le
reste du projet. Les couleurs sont celles du dégradé de l'app, pour que
l'icône et l'interface ne se contredisent pas.

    python3 tools/make-icon.py
"""
import struct, zlib, pathlib

SIZE = 180
TOP = (0xD8, 0xB4, 0xFE)   # --accent-2
BOTTOM = (0x7B, 0x2C, 0xBF)  # violet profond, fin du dégradé
INK = (0xFF, 0xFF, 0xFF)


def segment_distance(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    span = dx * dx + dy * dy
    t = 0.0 if not span else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / span))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


# Le « M » : deux montants et deux diagonales qui se rejoignent au centre.
STROKES = [
    (44, 132, 44, 48), (136, 132, 136, 48),
    (44, 48, 90, 104), (136, 48, 90, 104),
]
HALF = 11.5

rows = []
for y in range(SIZE):
    row = bytearray(b"\x00")            # filtre PNG « None »
    for x in range(SIZE):
        # Dégradé diagonal, comme le linear-gradient(140deg, …) de la page.
        t = (x * 0.42 + y * 0.58) / SIZE
        base = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        near = min(segment_distance(x, y, *s) for s in STROKES)
        if near <= HALF:
            row += bytes(INK)
        elif near <= HALF + 1.2:        # bord adouci : sinon le M est crénelé
            k = (near - HALF) / 1.2
            row += bytes(round(INK[i] + (base[i] - INK[i]) * k) for i in range(3))
        else:
            row += bytes(base)
    rows.append(bytes(row))


def chunk(tag, payload):
    body = tag + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))


png = (b"\x89PNG\r\n\x1a\n"
       + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
       + chunk(b"IEND", b""))

out = pathlib.Path(__file__).resolve().parent.parent / "docs" / "icon.png"
out.write_bytes(png)
print(f"{out} — {len(png)} octets")
