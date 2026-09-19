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

from PIL import Image

_cv2 = None
_cv2_loaded = False


def _get_cv2():
    global _cv2, _cv2_loaded
    if not _cv2_loaded:
        _cv2_loaded = True
        try:
            import cv2  # type: ignore
            _cv2 = cv2
        except ImportError:  # pragma: no cover
            _cv2 = None
    return _cv2


_zxingcpp = None
_zxingcpp_loaded = False


def _get_zxing():
    global _zxingcpp, _zxingcpp_loaded
    if not _zxingcpp_loaded:
        _zxingcpp_loaded = True
        try:
            import zxingcpp  # type: ignore
            _zxingcpp = zxingcpp
        except ImportError:  # pragma: no cover
            _zxingcpp = None
    return _zxingcpp


_pyzbar = None
_pyzbar_loaded = False


def _get_pyzbar():
    global _pyzbar, _pyzbar_loaded
    if not _pyzbar_loaded:
        _pyzbar_loaded = True
        try:
            from pyzbar import pyzbar  # type: ignore
            _pyzbar = pyzbar
        except ImportError:  # pragma: no cover
            _pyzbar = None
    return _pyzbar


MAX_DIM = 1600  # декодируем не крупнее этого — превью 24 Мп слишком медленно


def engines() -> dict:
    c = _get_cv2()
    z = _get_zxing()
    p = _get_pyzbar()
    return {
        'opencv': c is not None and hasattr(c, 'barcode'),
        'zxing': z is not None,
        'pyzbar': p is not None,
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
    c = _get_cv2()
    if c is None or not hasattr(c, 'barcode'):
        return out
    det = c.barcode_BarcodeDetector()
    texts = None
    try:
        res = det.detectAndDecode(bgr)
        if isinstance(res, tuple):
            for item in res:
                if isinstance(item, (list, tuple)):
                    texts = item
                    break
                # numpy ndarray check without top-level import
                if getattr(item, '__class__', None) and 'ndarray' in str(type(item)):
                    texts = item
                    break
    except Exception:
        try:
            texts = det.decodeMulti(bgr)
        except Exception:
            texts = None
    if texts is not None:
        try:
            import numpy as np
            for t in np.atleast_1d(np.asarray(texts, dtype=object)).ravel():
                s = str(t).strip()
                if not s or s.lower() in ('none', 'null'):
                    continue
                # v3.3: plausibility-фильтр. OpenCV-детектор умеет «видеть»
                # шум как текст; мусорная строка дальше блокирует ZXing
                # (см. detect(): if found: return). Принимаем только цифры
                # 8–13, а 13-значные — только с верной контрольной цифрой.
                if re.fullmatch(r'\d{13}', s):
                    if not _ean13_ok(s):
                        continue
                elif re.fullmatch(r'\d{8,13}', s):
                    pass
                else:
                    continue
                out.append({'text': s, 'engine': 'opencv'})
        except Exception:
            pass
    return out


def _ean13_ok(s: str) -> bool:
    try:
        v = sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(s[:12]))
        return (10 - v % 10) % 10 == int(s[12])
    except Exception:
        return False


def _zxing_find(im) -> list[dict]:
    out: list[dict] = []
    z = _get_zxing()
    if z is None:
        return out
    # zxing-cpp >= 3.0: read_barcodes
    if hasattr(z, 'read_barcodes'):
        try:
            res = z.read_barcodes(im)
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
        res = list(z.decode_multi(im) or [])
    except Exception:
        res = []
    if not res:
        try:
            r = z.decode(im)
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
    c = _get_cv2()
    if c is not None and hasattr(c, 'barcode'):
        try:
            import numpy as np
            arr = np.frombuffer(jpeg, dtype=np.uint8)
            bgr = c.imdecode(arr, c.IMREAD_COLOR)
            if bgr is not None:
                h, w = bgr.shape[:2]
                if max(h, w) > MAX_DIM:
                    k = MAX_DIM / max(h, w)
                    bgr = c.resize(bgr, (int(w * k), int(h * k)),
                                   interpolation=c.INTER_AREA)
                found = _opencv_find(bgr)
        except Exception:
            found = []

    if found:
        return _norm(found)

    # ---- Контур 2: ZXing-cpp ----
    z = _get_zxing()
    if z is not None:
        im = _load_gray(jpeg)
        if im is not None:
            found = _zxing_find(im)

    if found:
        return _norm(found)

    # ---- Контур 3: PyZBar (опционально) ----
    pz = _get_pyzbar()
    if pz is not None:
        im = _load_gray(jpeg)
        if im is not None:
            try:
                for r in pz.decode(im):
                    s = r.data.decode('ascii', 'ignore').strip()
                    if s:
                        found.append({'text': s, 'format': str(r.type), 'engine': 'pyzbar'})
            except Exception:
                pass

    return _norm(found)
