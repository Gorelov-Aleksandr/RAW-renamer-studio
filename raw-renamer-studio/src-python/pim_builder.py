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
    'штрих-код': 'gtin', 'штрихкод': 'gtin', 'gtin': 'gtin', 'штрих - код': 'gtin',
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


def _utf16_score(text: str) -> float:
    """Доля «смысловых» символов — для выбора порядка байтов UTF-16 без BOM."""
    if not text:
        return 0.0
    s = text[:4000]
    good = 0
    for ch in s:
        o = ord(ch)
        if ch in '\t\n\r':
            good += 1
        elif 0x20 <= o < 0x7F:
            good += 1
        elif o >= 0xA0 and o < 0xD800:
            good += 1
        elif 0xE000 <= o < 0xF900:
            good += 1
    return good / len(s)


def _detect_encoding(raw: bytes) -> str:
    """Автоопределение кодировки (v3.2.2 — надёжный детект без BOM).

    BOM: FF FE → UTF-16 LE · FE FF → UTF-16 BE · EF BB BF → UTF-8.
    Без BOM (PIM иногда так экспортирует):
      * много NUL-байтов → UTF-16; порядок байтов — по первому байту-нолю
        (иначе — по качеству декодирования LE vs BE);
      * иначе — строгий UTF-8 (fallback cp1251/UTF-8).
    Ранняя версия просто пыталась decode('utf-16-le') — она «успешно»
    декодировала любой файл чётной длины (UTF-8 без BOM ломался).
    """
    if raw[:2] == b'\xff\xfe':
        return 'utf-16-le'
    if raw[:2] == b'\xfe\xff':
        return 'utf-16-be'
    if raw[:3] == b'\xef\xbb\xbf':
        return 'utf-8-sig'
    if len(raw) >= 4:
        head = raw[:8192]
        if head.count(0) >= max(8, len(head) // 8):
            # Плотность NUL ~50% → UTF-16. Порядок байтов:
            for i in range(0, min(len(raw), 256) - 1, 2):
                if raw[i] == 0 and raw[i + 1] != 0:
                    return 'utf-16-be'
                if raw[i] != 0 and raw[i + 1] == 0:
                    return 'utf-16-le'
            # NUL-пар не встретились — сравниваем качество LE и BE
            try:
                s_le = raw.decode('utf-16-le')
            except Exception:
                s_le = ''
            try:
                s_be = raw.decode('utf-16-be')
            except Exception:
                s_be = ''
            return 'utf-16-le' if _utf16_score(s_le) >= _utf16_score(s_be) else 'utf-16-be'
        try:
            raw.decode('utf-8')
            return 'utf-8'
        except Exception:
            pass
        try:
            raw.decode('cp1251')
            return 'cp1251'
        except Exception:
            pass
    return 'utf-8'


def read_pim(path) -> list[dict]:
    """Парсинг экспорта PIM → [{'lm','name','otdel','gtin','model','gamma'}].

    v3.2.2: информативные ошибки (кодировка/разделитель/заголовки) вместо
    пустого списка — фронт показывает причину, а не «The string did not
    match the expected pattern».
    """
    raw = Path(path).read_bytes()
    if not raw.strip():
        raise ValueError('Файл пуст — выберите выгрузку PIM заново')
    enc = _detect_encoding(raw)
    try:
        text = raw.decode(enc)
    except Exception:
        text = raw.decode('utf-8', errors='replace')

    # Убираем BOM если есть
    text = text.lstrip('\ufeff')

    lines = [l for l in text.splitlines() if l.strip()]
    if not lines:
        raise ValueError(f'Файл пуст после декодирования (кодировка: {enc})')

    # Определяем разделитель: самый частый в заголовочной строке
    # (приоритет при равенстве: Tab > ';' > ',')
    first_line = lines[0]
    counts = [('\t', first_line.count('\t')), (';', first_line.count(';')),
              (',', first_line.count(','))]
    delim = max(counts, key=lambda p: p[1])[0] if any(c for _, c in counts) else '\t'

    try:
        rows = [r for r in csv.reader(io.StringIO(text), delimiter=delim)
                if any(c.strip() for c in r)]
    except csv.Error as e:
        raise ValueError(f'Не удалось разобрать CSV ({e}). '
                         f'Кодировка: {enc}, разделитель: {delim!r}') from None
    if not rows:
        raise ValueError(f'Не удалось разобрать строки (кодировка: {enc}, '
                         f'разделитель: {delim!r})')

    header = [h.strip().strip('"').lower() for h in rows[0]]
    idx: dict[str, int] = {}
    for i, h in enumerate(header):
        key = FIELD_MAP.get(h)
        if key is not None and key not in idx:
            idx[key] = i
    if 'lm' not in idx:
        preview = ' | '.join(h for h in header[:8] if h)
        raise ValueError(
            f'Заголовки экспорта PIM не распознаны (кодировка: {enc}, '
            f'разделитель: {delim!r}). Столбцы: {preview or "(пусто)"}. '
            f'Ожидаются: Id/Код LM, Название, Отдел, Штрих-код, Модель, Гамма')

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
    if not out:
        raise ValueError(
            f'Заголовки найдены, но товаров нет: среди {len(rows) - 1} строк '
            f'не обнаружен ни один код LM (6+ символов)')
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
    from openpyxl import Workbook
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter

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
