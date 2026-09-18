"""RAW Renamer Studio — Zayavka Builder (master §5).

Вход: сырая выгрузка PIM export_*.csv — UTF-16 LE с BOM, разделитель таб.
(поддерживаются также UTF-8 и разделитель ';').

Автодетект полей экспорта:
  Id → Код LM (A), Название → Товар (C), Отдел → B,
  Штрих-код → GTIN (D), Модель → Модель ADEO (H), Гамма → G.

Автоподстановка констант: Организация='photo production', Фотограф — из
профиля, Постащик='?', Ссылка на фотобук='https://fotobook-lemanapro.ru/'.

Выход: .xlsx (21 колонка A..U) или .csv (UTF-8, ';').
"""
from __future__ import annotations

import csv
import io
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

HEADERS = [
    'Код LM', 'Отдел', 'Товар', 'GTIN', 'Дата съемки', 'Дата AVS', 'Гамма',
    'Модель ADEO', 'Ссылка на фотобук', 'Постащик', 'Организация', 'Итого ракурсов',
    'Ракурс_25', 'Комментарий LM', 'Менеджер', 'Фотограф', 'Ассистент', 'Гладильщик',
    'Часы работы Гладильщика', 'Сборщик', 'Часы работы Сборщика',
]

FIELD_MAP = {
    'id': 'lm', 'код lm': 'lm', 'lm code': 'lm',
    'название': 'name', 'товар': 'name', 'наименование': 'name', 'name': 'name',
    'отдел': 'otdel',
    'штрих-код': 'gtin', 'штрихкод': 'gtin', 'gtin': 'gtin',
    'модель': 'model',
    'гамма': 'gamma',
}

DEFAULTS = {
    'org': 'photo production',
    'photographer': '',  # v3.1: не заполняем — пользователь пишет вручную (могут быть 2 фотографа)
    'date': '',          # v3.1: «Дата съемки» не заполняем; дата отражается в имени файла заявки
    'fotobook': 'https://fotobook-lemanapro.ru/',
    'supplier': '?',
}


def read_pim(path) -> list[dict]:
    """Парсинг экспорта PIM → [{'lm','name','otdel','gtin','model','gamma'}]."""
    raw = Path(path).read_bytes()
    if raw[:2] in (b'\xff\xfe', b'\xfe\xff'):
        text = raw.decode('utf-16')
    else:
        text = raw.decode('utf-8-sig')
    text = text.lstrip('\ufeff')
    lines = [l for l in text.splitlines() if l.strip()]
    if not lines:
        return []
    delim = '\t' if '\t' in lines[0] else (';' if ';' in lines[0] else ',')
    rows = [r for r in csv.reader(io.StringIO(text), delimiter=delim)
            if any(c.strip() for c in r)]
    header = [h.strip().lower() for h in rows[0]]
    idx: dict[str, int] = {}
    for i, h in enumerate(header):
        key = FIELD_MAP.get(h)
        if key is not None and key not in idx:
            idx[key] = i
    out = []
    for r in rows[1:]:
        def g(key: str) -> str:
            i = idx.get(key)
            if i is None or i >= len(r):
                return ''
            return r[i].strip().strip('"')
        lm = g('lm')
        if len(lm) < 6:
            continue
        out.append({
            'lm': lm, 'name': g('name'), 'otdel': g('otdel') or '3',
            'gtin': g('gtin'), 'model': g('model'), 'gamma': g('gamma') or 'А',
        })
    return out


def _row_values(r: dict, c: dict) -> list:
    return [
        r['lm'], r['otdel'], r['name'], r['gtin'], c.get('date') or '', '',
        r['gamma'],
        r['model'], c.get('fotobook', DEFAULTS['fotobook']),
        c.get('supplier', DEFAULTS['supplier']), c.get('org', DEFAULTS['org']),
        0, 0, '', '', c.get('photographer') or '',
        '', '', '', '', '',
    ]


def build_xlsx(rows: list[dict], out_path, constants: dict | None = None) -> Path:
    c = {**DEFAULTS, **(constants or {})}
    wb = Workbook()
    ws = wb.active
    ws.title = 'Заявка'
    ws.append(HEADERS)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for r in rows:
        ws.append(_row_values(r, c))
    widths = [12, 7, 46, 15, 12, 12, 8, 12, 26, 10, 18, 13, 10, 20, 14, 12, 12, 12, 16, 12, 16]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = 'A2'
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)
    return Path(out_path)


def build_csv(rows: list[dict], out_path, constants: dict | None = None) -> Path:
    c = {**DEFAULTS, **(constants or {})}
    buf = io.StringIO()
    wcsv = csv.writer(buf, delimiter=';', lineterminator='\r\n', quoting=csv.QUOTE_MINIMAL)
    wcsv.writerow(HEADERS)
    for r in rows:
        wcsv.writerow(_row_values(r, c))
    p = Path(out_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text('\ufeff' + buf.getvalue(), encoding='utf-8')
    return p
