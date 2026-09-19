"""RAW Renamer Studio — Embedded RAW Preview Engine.

Правило №1 (master §13): НИКОГДА не делать полный демозаик RAW для превью —
только чтение встроенного JPEG (FFD8…FFD9) из контейнера.

Поддерживаемые контейнеры: .CR2/.CR3 (Canon), .ARW (Sony), .NEF (Nikon),
.ORF (Olympus), .RW2 (Panasonic), .DNG, .RAF, .NRW, .PEF, .X3F.
"""
from __future__ import annotations

import hashlib
import io
from pathlib import Path
from typing import Optional

from PIL import Image

RAW_EXTS = {
    '.cr2', '.cr3', '.arw', '.nef', '.orf', '.rw2',
    '.dng', '.raf', '.nrw', '.pef', '.x3f',
    # v3.5: редкие/старые форматы (унаследовано от первой версии инструмента):
    # CRW (Canon до 2003), SR2/SRF (Sony), 3FR (Hasselblad), FFF (старый Fuji),
    # .raw (общее). Превью может не извлечься — файл всё равно виден в партии.
    '.crw', '.srf', '.sr2', '.3fr', '.fff', '.raw',
}

_SOI = b'\xff\xd8\xff'
_EOI = b'\xff\xd9'
_MIN_PREVIEW = 4096  # байт: игнорируем крошечные фрагменты/миниатюры


def is_raw(path: Path) -> bool:
    return path.suffix.lower() in RAW_EXTS


def file_hash(path: Path) -> str:
    """Стабильный идентификатор файла для протокола /preview/{hash}.

    Хеш строится из (путь, mtime, размер) — без чтения содержимого.
    """
    st = path.stat()
    raw = f"{path}|{st.st_mtime_ns}|{st.st_size}".encode('utf-8')
    return hashlib.sha1(raw).hexdigest()[:16]


def find_jpeg_spans(data, max_spans: int = 128) -> list[tuple[int, int]]:
    """Все вхождения JPEG-диапазонов (SOI…EOI) внутри контейнера.

    data — bytes или mmap (v3.3: mmap, чтобы не держать весь файл в RAM).
    Ищет границы блоков: от каждого _SOI до последнего _EOI перед следующим _SOI,
    а также проверяет промежуточные EOI.
    """
    spans: list[tuple[int, int]] = []
    n = len(data)
    pos = 0

    # Собираем все позиции SOI
    soi_positions: list[int] = []
    while pos < n and len(soi_positions) < max_spans:
        s = data.find(_SOI, pos)
        if s < 0:
            break
        soi_positions.append(s)
        pos = s + 3

    if not soi_positions:
        return []

    for idx, s in enumerate(soi_positions):
        next_s = soi_positions[idx + 1] if idx + 1 < len(soi_positions) else n
        # Ищем все EOI между s и next_s
        eois: list[int] = []
        e_pos = s + 3
        while e_pos < next_s:
            e = data.find(_EOI, e_pos)
            if e < 0 or e >= next_s:
                break
            eois.append(e + 2)
            e_pos = e + 2

        if eois:
            # Самый вероятный полный JPEG — по последнему EOI перед следующим SOI
            spans.append((s, eois[-1]))
            # Если eois несколько, также сохраняем первый (на случай если это отдельная миниатюра)
            if len(eois) > 1:
                spans.append((s, eois[0]))

    return spans


def is_valid_jpeg(data: bytes) -> bool:
    """Быстрая проверка целостности встроенного JPEG через PIL."""
    if len(data) < _MIN_PREVIEW:
        return False
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.verify()
            return True
    except Exception:
        return False


def extract_preview_bytes(data: bytes, max_spans: int = 32) -> Optional[bytes]:
    """Крупнейший ВАЛИДНЫЙ встроенный JPEG (главное превью). None, если не найден."""
    # Если данные сами по себе валидный JPEG:
    if is_valid_jpeg(data):
        return data

    spans = find_jpeg_spans(data, max_spans=max_spans)
    if not spans:
        return None

    # Сортируем кандидаты по размеру (от большего к меньшему)
    sorted_spans = sorted(spans, key=lambda t: t[1] - t[0], reverse=True)
    for s, e in sorted_spans:
        if e - s < _MIN_PREVIEW:
            continue
        chunk = data[s:e]
        if is_valid_jpeg(chunk):
            return chunk

    # Фолбэк: если строгая верификация не прошла, но размер достаточен
    largest_s, largest_e = sorted_spans[0]
    if largest_e - largest_s >= _MIN_PREVIEW:
        return data[largest_s:largest_e]
    return None


def extract_preview(path: Path) -> Optional[bytes]:
    """v3.3: mmap-чтение — файл не грузится целиком в память; в память
    попадает только найденный JPEG (обычно 1–8 МБ из 25 МБ RAW)."""
    p = Path(path)
    try:
        size = p.stat().st_size
        if size < _MIN_PREVIEW:
            return None
        import mmap
        with open(p, 'rb') as f:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
            try:
                # Если сам файл — валидный JPEG:
                if p.suffix.lower() in ('.jpg', '.jpeg'):
                    content = mm[:]
                    if is_valid_jpeg(content):
                        return content

                spans = find_jpeg_spans(mm, max_spans=32)
                if not spans:
                    return None
                sorted_spans = sorted(spans, key=lambda t: t[1] - t[0], reverse=True)
                for s, e in sorted_spans:
                    if e - s < _MIN_PREVIEW:
                        continue
                    chunk = mm[s:e]
                    if is_valid_jpeg(chunk):
                        return chunk
                largest_s, largest_e = sorted_spans[0]
                if largest_e - largest_s >= _MIN_PREVIEW:
                    return mm[largest_s:largest_e]
                return None
            finally:
                mm.close()
    except (OSError, ValueError):
        # пустой файл / FS без mmap-поддержки — fallback
        try:
            return extract_preview_bytes(p.read_bytes())
        except OSError:
            return None


def make_jpeg_thumb(jpeg: bytes, size: int, quality: int = 85) -> bytes:
    """Даунскейл встроенного JPEG под thumbnail (LANCZOS). 3–8 мс на типичном превью."""
    with Image.open(io.BytesIO(jpeg)) as im:
        if im.mode != 'RGB':
            im = im.convert('RGB')
        im.thumbnail((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=quality, optimize=True)
        return buf.getvalue()
