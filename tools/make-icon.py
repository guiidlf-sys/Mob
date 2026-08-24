#!/usr/bin/env python3
"""Régénère docs/icon.png — le fantôme de Mob.

Écrit le PNG à la main (zlib + struct) : aucune dépendance tierce, comme le
reste du projet. Le fantôme est le même que celui dessiné en SVG dans la
page ; les couleurs sont celles du dégradé de l'app, pour que l'icône et
l'interface ne se contredisent pas.

    python3 tools/make-icon.py
"""
import math, struct, zlib, pathlib

SIZE = 180
TOP = (0xD8, 0xB4, 0xFE)     # --accent-2
BOTTOM = (0x7B, 0x2C, 0xBF)  # fin du dégradé
INK = (0xFF, 0xFF, 0xFF)

# Géométrie du fantôme, en pixels de l'icône.
CX, DOME_Y, R = 90.0, 76.0, 46.0     # la coupole
FLANC_BAS = 126.0                    # où les flancs cèdent aux festons
LOBES, PROFONDEUR = 3, 22.0          # trois bosses vers le bas
CREUX_MINI = 0.22                    # les creux ne remontent pas jusqu'au corps
GAUCHE, DROITE = CX - R, CX + R

YEUX = [(72.0, 72.0, 9.0, 11.5), (108.0, 72.0, 9.0, 11.5)]
BOUCHE = (90.0, 98.0, 6.5, 8.5)


def dans_ellipse(x, y, cx, cy, rx, ry):
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0


def dans_fantome(x, y):
    """Coupole ronde, flancs droits, bas festonné — puis les trous."""
    if y < DOME_Y:
        if (x - CX) ** 2 + (y - DOME_Y) ** 2 > R * R:
            return False
    elif y <= FLANC_BAS:
        if not (GAUCHE <= x <= DROITE):
            return False
    else:
        if not (GAUCHE <= x <= DROITE):
            return False
        # Une cosinusoïde donne des lobes qui reviennent pile au bord.
        # Sans le plancher CREUX_MINI, les lobes se rejoignent en pointe et
        # le fantôme se met à ressembler à une mâchoire.
        t = (x - GAUCHE) / (2 * R)
        onde = 0.5 - 0.5 * math.cos(2 * math.pi * LOBES * t)
        creux = FLANC_BAS + PROFONDEUR * (CREUX_MINI + (1 - CREUX_MINI) * onde)
        if y > creux:
            return False

    for cx, cy, rx, ry in YEUX + [BOUCHE]:
        if dans_ellipse(x, y, cx, cy, rx, ry):
            return False       # les yeux et la bouche laissent voir le fond
    return True


def couverture(x, y):
    """Trois sous-points par axe : sans ça, le contour est crénelé."""
    dedans = 0
    for i in range(3):
        for j in range(3):
            if dans_fantome(x + (i + 0.5) / 3, y + (j + 0.5) / 3):
                dedans += 1
    return dedans / 9.0


rows = []
for y in range(SIZE):
    row = bytearray(b"\x00")            # filtre PNG « None »
    for x in range(SIZE):
        # Dégradé diagonal, comme le linear-gradient(140deg, …) de la page.
        t = (x * 0.42 + y * 0.58) / SIZE
        fond = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        k = couverture(x, y)
        if k <= 0:
            row += bytes(fond)
        elif k >= 1:
            row += bytes(INK)
        else:
            row += bytes(round(fond[i] + (INK[i] - fond[i]) * k) for i in range(3))
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
