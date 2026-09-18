"""RAW Renamer Studio — сессия съёмки.

Сканирование папки RAW, группировка кадров в товары (master §6) и план
именования (master §4).

РЕЖИМ CV: кадр, на превью которого найден ШК, открывает новый товар и
становится кадром этикетки (_y). Все последующие кадры до следующего кадра
со ШК привязываются к этому товару.
РЕЖИМ NAMES: ШК содержится в имени файла (4650101098770.CR2, …_01.CR2);
файл с суффиксом _y назначается кадром этикетки.
Маркеры камеры: *M2A0885*4600000000001.CR2 — ШК задан принудительно.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Callable, Optional

from raw_engine import RAW_EXTS, file_hash
from scanner import detect

MARKER_RE = re.compile(r'\*(\d{8,13})\.[A-Za-z0-9]+$')
NAMES_RE = re.compile(r'^(\d{13})(?:_(.*))?$')
SUFFIX_RE = re.compile(r'^(?:_\d{1,4}|_com|_pack|_ins|_tag)$')


def natural_sort_key(name: str):
    """Сортировка по натуральным числам (master §13.4): _M2A0881 < _M2A0882."""
    return [int(p) if p.isdigit() else p for p in re.split(r'(\d+)', name)]


def _new_item(n: int, barcode: Optional[str], source: str) -> dict:
    return {
        'id': f'it{n:03d}',
        'barcode': barcode,
        'lm_code': None,
        'product_name': None,
        'frames': [],
        'status': 'err' if not barcode else 'ok',
        'is_new': False,
        'source': source,
        'lookup_source': None,
        'excel_row': None,
        'has_label': False,
    }


def _frame(f: Path, is_label: bool) -> dict:
    return {
        'name': f.name,
        'size': f.stat().st_size,
        'is_label': is_label,
        'suffix_custom': None,
        'preview': file_hash(f),
        'ext': f.suffix or '.CR2',  # v3.3: расширение каждого файла отдельно
    }


def _cleanup_tmp(folder: Path, warnings: list) -> None:
    """v3.3: убрать осиротевшие .tmp_rename от прерванной предыдущей операции."""
    for f in folder.glob('*.tmp_rename'):
        try:
            f.unlink()
            warnings.append(f'Убрано осиротевшее временное имя: {f.name}')
        except OSError:
            pass


def scan_folder(folder, mode: str = 'cv',
                preview_loader: Optional[Callable[[Path], Optional[bytes]]] = None) -> dict:
    """Сканирует папку RAW. preview_loader(path) → bytes встроенного JPEG (с кэшем)."""
    folder = Path(folder)
    if not folder.is_dir():
        raise FileNotFoundError(f'Папка не найдена: {folder}')
    files = [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in RAW_EXTS]
    files.sort(key=lambda f: natural_sort_key(f.name))
    warnings: list[str] = []
    _cleanup_tmp(folder, warnings)

    items: list[dict] = []
    current: Optional[dict] = None

    def start_item(barcode: Optional[str], source: str, frame: Path, is_label: bool) -> None:
        nonlocal current
        it = _new_item(len(items) + 1, barcode, source)
        it['frames'].append(_frame(frame, is_label))
        it['has_label'] = is_label
        items.append(it)
        current = it

    def attach(frame: Path, is_label: bool = False) -> None:
        nonlocal current
        if current is None:
            start_item(None, 'orphan', frame, False)
            warnings.append(f'ШК не найден (сирота): {frame.name}')
        else:
            current['frames'].append(_frame(frame, is_label))
            current['has_label'] = current['has_label'] or is_label

    for f in files:
        # 1) маркер камеры — принудительный ШК без CV
        m = MARKER_RE.search(f.name)
        if m:
            start_item(m.group(1), 'marker', f, True)
            continue

        if mode == 'names':
            mm = NAMES_RE.match(f.stem)
            if mm:
                bc, hint = mm.group(1), (mm.group(2) or '').lower()
                is_label = hint == 'y'
                if current is None or current.get('barcode') != bc:
                    start_item(bc, 'names', f, is_label)
                else:
                    attach(f, is_label)
            else:
                # Имя не кодирует ШК → каждая такая RAW-ка — отдельный
                # сиротливый товар (оператор назначит ШК вручную).
                start_item(None, 'orphan', f, False)
                warnings.append(f'ШК не найден в имени файла (сирота): {f.name}')
            continue

        # 2) CV-режим: ШК ищем на встроенном превью
        found = None
        if preview_loader is not None:
            prev = preview_loader(f)
            if prev:
                res = detect(prev)
                ean = next((r for r in res if r.get('is_ean')), None)
                if ean is None and res:
                    ean = res[0]
                if ean:
                    found = (ean['text'], f"cv:{ean['engine']}")
        if found:
            start_item(found[0], found[1], f, True)
        else:
            attach(f)

    for it in items:
        if not it['barcode']:
            it['status'] = 'err'
        elif not it['has_label']:
            it['status'] = 'warn'
        else:
            it['status'] = 'ok'
    return {'items': items, 'total_frames': len(files), 'warnings': warnings}


def plan_item(item: dict, lm: str) -> list[dict]:
    """План именования товара (master §4).

    * кадр этикетки → <артикул>_y.<ext>
    * главный ракурс → <артикул>.<ext> (СТРОГО БЕЗ СУФФИКСА)
    * остальные → <артикул>_01, _02, … (оператор может задать кастомный
      суффикс: _06, _com, _pack, _ins, _tag)
    """
    frames = item['frames']
    if not frames:
        return []
    label_i = next((i for i, f in enumerate(frames) if f['is_label']), None)
    rows: list[dict] = []
    if label_i is not None:
        lf = frames[label_i]
        rows.append({'src': lf['name'], 'dst': f"{lm}_y{lf.get('ext', Path(lf['name']).suffix)}",
                     'kind': 'label', 'item_id': item['id']})
    clean = [f for i, f in enumerate(frames) if i != label_i]
    for i, f in enumerate(clean):
        if i == 0:
            suf, kind = '', 'main'
        else:
            suf = (f.get('suffix_custom') or '').strip()
            if suf and not suf.startswith('_'):
                suf = '_' + suf
            if not suf or not SUFFIX_RE.match(suf):
                suf = f'_{i:02d}'
            kind = 'angle'
        ext = f.get('ext') or (Path(f['name']).suffix or '.CR2')  # v3.3: ext файла
        rows.append({'src': f['name'], 'dst': f'{lm}{suf}{ext}',
                     'kind': kind, 'item_id': item['id']})
    return rows
