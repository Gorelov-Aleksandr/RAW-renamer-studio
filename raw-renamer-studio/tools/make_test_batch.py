#!/usr/bin/env python3
"""Генератор тестовой партии RAW Renamer Studio.

Создаёт в указанной директории (по умолчанию <root>/test_batch):
  * shoot_2026-09-16/ — «фальшивые RAW» (.CR2 = контейнер со встроенным JPEG):
    первый кадр товара — этикетка с НАСТОЯЩЕГО штрихкода EAN-13 (сканер
    реально распознаёт его через OpenCV/ZXing);
  * export_pim.csv — выгрузка PIM (UTF-16 LE BOM, табуляция);
  * zayavka_17.09.2026.xlsx — заявка, собранная через pim_builder (догфудинг).

Фото товаров берутся из <batch>/source/<key>.jpg; если папки/фото нет —
рисуется синтетический плейсхолдер (тестам достаточно геометрии и ШК).

Использование:  python3 tools/make_test_batch.py [batch_dir]
Вызывается автоматически pytest (tests/conftest.py) в tmp-каталог.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / 'src-python'))
from pim_builder import build_xlsx, read_pim  # noqa: E402

BATCH = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else _ROOT / 'test_batch'
RAW_DIR = BATCH / 'shoot_2026-09-16'
SRC = BATCH / 'source'

# (Код LM, префикс GTIN 12 цифр, название, фото, кадры)  'y' = этикетка со ШК
# (первый кадр), '' = главный ракурс, '_01'… = последующие ракурсы.
# Контрольная цифра EAN-13 вычисляется: без валидного ШК декодер честно
# отклоняет этикетку.
PRODUCTS = [
    ('89458028', '465010109881', 'Кресло офисное эргономичное AtlasDesign', 'chair',
     ['y', '', '_01', '_02']),
    ('89458031', '465010109883', 'Лампа настольная LED, черная', 'lamp',
     ['y', '', '_01']),
    ('89458102', '465010109890', 'Ручка дверная из нержавеющей стали', 'handle',
     ['y', '', '_01']),
    ('89458044', '465010109885', 'Дрель-шуруповерт аккумуляторный 18 В', 'drill',
     ['y', '', '_01', '_02', '_03']),
    ('89458047', '465010109886', 'Краска белая матовая 2,5 л (с валиком)', 'paint',
     ['y', '', '_01']),
    ('89458053', '465010109887', 'Смеситель кухонный, хром', 'faucet',
     ['y', '', '_01', '_02']),
]

# ------------------------------------------------------------------- EAN-13
L = {'0': '0001101', '1': '0011001', '2': '0010011', '3': '0111101', '4': '0100011',
     '5': '0110001', '6': '0101111', '7': '0111011', '8': '0110111', '9': '0001011'}
G = {'0': '0100111', '1': '0110011', '2': '0011011', '3': '0100001', '4': '0011101',
     '5': '0111001', '6': '0000101', '7': '0010001', '8': '0001001', '9': '0010111'}
PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG',
          'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']


def ean13_check(digits12: str) -> str:
    s = sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(digits12))
    return str((10 - s % 10) % 10)


def ean13_modules(code13: str) -> str:
    p = PARITY[int(code13[0])]
    out = '101'
    for i in range(1, 7):
        d = code13[i]
        out += (L if p[i - 1] == 'L' else G)[d]
    out += '01010'
    for d in code13[7:]:
        out += ''.join('1' if c == '0' else '0' for c in L[d])
    return out + '101'


def _font(size: int):
    for path in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                 '/System/Library/Fonts/Helvetica.ttc',
                 'C:/Windows/Fonts/arial.ttf'):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def draw_label(gtin: str, art: str, out: Path) -> None:
    W, H = 900, 675
    img = Image.new('RGB', (W, H), (228, 228, 226))  # студийный серый
    d = ImageDraw.Draw(img)
    cw, ch = 600, 320
    x0, y0 = (W - cw) // 2, (H - ch) // 2 - 8
    d.rounded_rectangle([x0, y0, x0 + cw, y0 + ch], radius=14, fill='white')
    modules = ean13_modules(gtin)
    qw = 4
    bw = len(modules) * qw
    bx = x0 + (cw - bw) // 2
    by = y0 + 42
    bh = 150
    for i, m in enumerate(modules):
        if m == '1':
            d.rectangle([bx + i * qw, by, bx + (i + 1) * qw - 1, by + bh], fill='black')
    d.text((bx, by + bh + 14), f'{gtin[:3]} {gtin[3:6]} {gtin[6:12]} {gtin[12]}',
           fill='black', font=_font(24))
    d.text((x0 + 22, y0 + ch - 40), f'LM {art}', fill='#333333', font=_font(18))
    img.save(out, 'JPEG', quality=92)


def load_photo(key: str) -> Image.Image:
    p = SRC / f'{key}.jpg'
    if p.exists():
        im = Image.open(p).convert('RGB')
    else:
        # синтетический фолбэк, если фото товаров не предоставлены
        im = Image.new('RGB', (1000, 750), (214, 216, 222))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([260, 140, 740, 610], radius=42, fill=(168, 172, 186))
        d.text((400, 360), key.upper(), fill=(84, 88, 104), font=_font(64))
    w, h = im.size
    target = 4 / 3
    if w / h > target:
        nw = int(h * target)
        x = (w - nw) // 2
        im = im.crop((x, 0, x + nw, h))
    else:
        nh = int(w / target)
        y = (h - nh) // 2
        im = im.crop((0, y, w, y + nh))
    return im.resize((1000, 750), Image.LANCZOS)




def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)

    cam = 800
    made = 0
    for lm, gprefix, name, photo, frames in PRODUCTS:
        gtin = gprefix + ean13_check(gprefix)
        for f in frames:
            cam += 1
            out = RAW_DIR / f'_M2A{cam:04d}.CR2'
            if f == 'y':
                draw_label(gtin, lm, out)
            else:
                load_photo(photo).save(out, 'JPEG', quality=88)
            made += 1

    # PIM-экспорт: UTF-16 LE BOM + табуляция
    pim = BATCH / 'export_pim.csv'
    header = ['Id', 'Название', 'Отдел', 'Штрих-код', 'Модель', 'Гамма']
    lines = ['\t'.join(header)]
    for lm, gprefix, name, _p, _f in PRODUCTS:
        gtin = gprefix + ean13_check(gprefix)
        lines.append('\t'.join([lm, name, '3', gtin, '200304', 'А']))
    text = '\ufeff' + '\r\n'.join(lines)
    pim.write_bytes(text.encode('utf-16-le'))

    # заявка через pim_builder (догфудинг)
    rows = read_pim(pim)
    out_x = BATCH / 'zayavka_17.09.2026.xlsx'
    build_xlsx(rows, out_x, {'date': '17.09.2026', 'photographer': 'Кирилл',
                             'org': 'photo production'})
    print(f'OK: RAW-файлов {made}, товаров в PIM {len(rows)}, '
          f'заявка {out_x.name} → {BATCH}')


if __name__ == '__main__':
    main()
