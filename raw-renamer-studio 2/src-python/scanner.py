"""RAW Renamer Studio — двухэтапный сканер штрихкодов (master §7).

Контур 1: OpenCV BarcodeDetector (cv2.barcode) — быстрая проверка.
          (В OpenCV 5.x детектор часто находит область, но не декодирует —
          тогда естественный переход на контур 2.)
Контур 2: ZXing-cpp — эталонный декодер EAN-13/EAN-8/Code128/QR.
          Поддерживаются API 2.x (decode/decode_multi) и 3.x (read_barcodes).
Контур 3 (опционально): PyZBar.

Вход: байты встроенного JPEG (из raw_engine).
"""
from __future__ import annotations

import io
import re
from typing import Optional

import numpy as np
from PIL import Image

try:
    import cv2  # type: ignore
except ImportError:  # pragma: no cover
    cv2 = None

try:
    import zxingcpp  # type: ignore
except ImportError:  # pragma: no cover
    zxingcpp = None

try:
    from pyzbar import pyzbar  # type: ignore
except ImportError:  # pragma: no cover
    pyzbar = None

MAX_DIM = 1600  # декодируем не крупнее этого — превью 24 Мп слишком медленно


def engines() -> dict:
    return {
        'opencv': cv2 is not None and hasattr(cv2, 'barcode'),
        'zxing': zxingcpp is not None,
        'pyzbar': pyzbar is not None,
    }


def _load_gray(jpeg: bytes) -> Optional[Image.Image]:
    try:
        im = Image.open(io.BytesIO(jpeg))
        im.load()
        im = im.convert('L')
        if max(im.size) > MAX_DIM:
            im.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
        return im
    except Exception:
        return None


def _opencv_find(bgr) -> list[dict]:
    """OpenCV 4.x и 5.x: сигнатуры возвращаемых значений разные — берём
    массив строк текстно-безопасно."""
    out: list[dict] = []
    if cv2 is None or not hasattr(cv2, 'barcode'):
        return out
    det = cv2.barcode_BarcodeDetector()
    texts = None
    try:
        res = det.detectAndDecode(bgr)
        if isinstance(res, tuple):
            for item in res:
                if isinstance(item, (list, tuple, np.ndarray)):
                    texts = item
                    break
    except Exception:
        try:
            texts = det.decodeMulti(bgr)
        except Exception:
            texts = None
    if texts is not None:
        try:
            for t in np.atleast_1d(np.asarray(texts, dtype=object)).ravel():
                s = str(t).strip()
                if s and s.lower() not in ('none', 'null'):
                    out.append({'text': s, 'engine': 'opencv'})
        except Exception:
            pass
    return out


def _zxing_find(im) -> list[dict]:
    out: list[dict] = []
    # zxing-cpp >= 3.0: read_barcodes
    if hasattr(zxingcpp, 'read_barcodes'):
        try:
            res = zxingcpp.read_barcodes(im)
        except Exception:
            res = []
        for r in (res or []):
            t = (getattr(r, 'text', '') or '').strip()
            if t:
                fmt = getattr(r, 'format', None)
                out.append({
                    'text': t,
                    'format': getattr(fmt, 'name', None) or str(fmt),
                    'engine': 'zxing',
                    'valid': bool(getattr(r, 'valid', True)),
                })
        return out
    # zxing-cpp 2.x: decode_multi / decode
    try:
        res = list(zxingcpp.decode_multi(im) or [])
    except Exception:
        res = []
    if not res:
        try:
            r = zxingcpp.decode(im)
            if getattr(r, 'valid', True) and (getattr(r, 'text', '') or '').strip():
                res = [r]
        except Exception:
            res = []
    for r in res:
        t = (getattr(r, 'text', '') or '').strip()
        if t:
            fmt = getattr(r, 'format', None)
            out.append({'text': t,
                        'format': getattr(fmt, 'name', None) or str(fmt),
                        'engine': 'zxing'})
    return out


def _norm(found: list[dict]) -> list[dict]:
    out = []
    for f in found:
        f = dict(f)
        t = f['text']
        f['is_ean'] = bool(re.fullmatch(r'\d{13}', t))
        out.append(f)
    # сначала EAN-13, затем по убыванию длины
    out.sort(key=lambda f: (not f['is_ean'], -len(f['text'])))
    return out


def detect(jpeg: bytes) -> list[dict]:
    """Возвращает [{'text','format','engine','is_ean'}] по достоверности."""
    found: list[dict] = []

    # ---- Контур 1: OpenCV ----
    if cv2 is not None and hasattr(cv2, 'barcode'):
        try:
            arr = np.frombuffer(jpeg, dtype=np.uint8)
            bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if bgr is not None:
                h, w = bgr.shape[:2]
                if max(h, w) > MAX_DIM:
                    k = MAX_DIM / max(h, w)
                    bgr = cv2.resize(bgr, (int(w * k), int(h * k)),
                                     interpolation=cv2.INTER_AREA)
                found = _opencv_find(bgr)
        except Exception:
            found = []

    if found:
        return _norm(found)

    # ---- Контур 2: ZXing-cpp ----
    if zxingcpp is not None:
        im = _load_gray(jpeg)
        if im is not None:
            found = _zxing_find(im)

    if found:
        return _norm(found)

    # ---- Контур 3: PyZBar (опционально) ----
    if pyzbar is not None:
        im = _load_gray(jpeg)
        if im is not None:
            try:
                for r in pyzbar.decode(im):
                    s = r.data.decode('ascii', 'ignore').strip()
                    if s:
                        found.append({'text': s, 'format': str(r.type), 'engine': 'pyzbar'})
            except Exception:
                pass

    return _norm(found)
