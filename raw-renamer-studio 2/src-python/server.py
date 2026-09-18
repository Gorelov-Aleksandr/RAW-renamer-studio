"""RAW Renamer Studio — Python Sidecar (FastAPI).

Протокол (master §8):
  * динамический порт (--port 0); ПЕРВАЯ СТРОКА stdout:
        {"event": "SIDECAR_READY", "port": 49215, "pid": 18492}
    порт дополнительно пишется в файл (--port-file) для dev-прокси;
  * GET  /preview/{file_hash}?size=320 — встроенный JPEG превью (image/jpeg);
  * POST /rpc — JSON-RPC 2.0:
        system.heartbeat, system.info,
        session.open_folder, session.get, session.set_zayavka,
        session.move_frame, session.set_frame_suffix, session.apply_barcode,
        session.refresh_angles,
        lookup.find_sku,
        zayavka.generate,
        renamer.plan, renamer.execute, renamer.undo, renamer.retry_xlsx, renamer.journal,
        file.download
  * POST /upload — приём файла (PIM-выгрузка и т.п.) в data-dir/uploads;
  * защита от зомби: фронт пингует system.heartbeat каждые 3 с; > 8 с без
    пинга — sidecar завершает работу exit(0).
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import socket
import sys
import threading
import time
import traceback
from pathlib import Path
from typing import Any, Callable, Optional

import uvicorn
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

sys.path.insert(0, str(Path(__file__).resolve().parent))

from excel_worker import ExcelWorker, XlsxLockedError  # noqa: E402
from lookup import Lookup  # noqa: E402
from pim_builder import build_csv, build_xlsx, read_pim  # noqa: E402
from raw_engine import extract_preview, extract_preview_bytes, file_hash, make_jpeg_thumb  # noqa: E402
from renamer import Journal, RenameError, execute as execute_rename, undo_rename  # noqa: E402
from rrslog import RrsLog, summarize  # noqa: E402
from scanner import engines as scanner_engines  # noqa: E402
from session import plan_item, scan_folder  # noqa: E402

VERSION = '0.1.1'
START = time.time()

LOG: Optional[RrsLog] = None  # инициализируется в main()
RUN_ID = ''


def log(action: str, level: str = 'info', session_id: Optional[str] = None, **kw) -> None:
    """Универсальный логгер (no-op до инициализации main)."""
    if LOG is not None:
        LOG.log(action, level=level, session_id=session_id, **kw)

app = FastAPI(title='RAW Renamer Studio Sidecar', version=VERSION)
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])


class RpcError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# --------------------------------------------------------------------------- state
class S:
    data_dir: Path = Path('.')
    demo_dir: Optional[Path] = None
    zayavka_path: Optional[Path] = None
    zayavka: Optional[ExcelWorker] = None
    lookup: Optional[Lookup] = None
    journal: Optional[Journal] = None
    items: list = []
    folder: Optional[Path] = None
    mode: str = 'cv'
    file_registry: dict = {}      # hash -> Path
    last_beat: float = 0.0
    port: int = 0


state = S()
LOCK = threading.RLock()

SETTINGS_FILE_NAME = 'settings.json'
DEFAULT_SETTINGS = {
    'apim_env': 'preprod',
    'apim_enabled': True,
    'customer_id': '60071799',
}


def _settings_path() -> Path:
    return state.data_dir / SETTINGS_FILE_NAME


def load_settings() -> dict:
    """v3.3: настройки сохраняются между запусками (master: «не сбрасываются»)."""
    s = dict(DEFAULT_SETTINGS)
    p = _settings_path()
    if not p.exists():
        return s  # первый запуск — не ошибка
    try:
        s.update(json.loads(p.read_text(encoding='utf-8')))
    except Exception as e:
        log('settings_load', level='warn', error=f'файл повреждён, использую дефолты: {e}')
    return s


def save_settings(s: dict) -> None:
    try:
        p = _settings_path()
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_name(p.name + '.tmp')
        tmp.write_text(json.dumps(s, ensure_ascii=False, indent=1), encoding='utf-8')
        os.replace(tmp, p)
    except Exception as e:
        log('settings_save', level='warn', error=str(e))


PREV_CACHE: dict[str, bytes] = {}
PREV_CACHE_MAX = 80 * 1024 * 1024
THUMB_CACHE: dict[tuple[str, int], bytes] = {}


def _get_preview(path: Path) -> Optional[bytes]:
    """Встроенный JPEG файла (с LRU-кэшем). hash → path регистрируется.

    v3.3: чтение через mmap (raw_engine.extract_preview) — в RAM попадает
    только сам JPEG, а не весь 25 МБ RAW.
    """
    h = file_hash(path)
    state.file_registry[h] = path
    if h in PREV_CACHE:
        return PREV_CACHE[h]
    try:
        prev = extract_preview(path)
    except OSError:
        prev = None
    if prev:
        total = sum(len(v) for v in PREV_CACHE.values()) + len(prev)
        while total > PREV_CACHE_MAX and PREV_CACHE:
            total -= len(PREV_CACHE.pop(next(iter(PREV_CACHE))))
        PREV_CACHE[h] = prev
    return prev


# --------------------------------------------------------------------------- rpc
METHODS: dict[str, Callable[[dict], Any]] = {}


def method(name: str):
    def deco(fn):
        METHODS[name] = fn
        return fn
    return deco


def _item(item_id: str) -> dict:
    for it in state.items:
        if it['id'] == item_id:
            return it
    raise RpcError(4004, 'Товар не найден')


def _set_zayavka(path: Path) -> None:
    state.zayavka = ExcelWorker(path)
    state.zayavka_path = Path(path)


def _apply_lookup(it: dict, r: dict) -> None:
    it['lm_code'] = r['lm']
    it['product_name'] = r.get('name')
    it['lookup_source'] = r['source']
    it['excel_row'] = r.get('row')
    it['is_new'] = r['source'] is None
    if not it['has_label']:
        it['status'] = 'warn'
    elif it['lm_code'] or it['lookup_source'] is not None:
        it['status'] = 'ok'
    else:
        it['status'] = 'ok'


def _enrich(items: list, session_id: Optional[str] = None) -> None:
    """Каскадный lookup для всех товаров (Заявка → кэш → APIM).

    v3.3: быстрая часть (заявка+кэш) — последовательно; APIM — параллельно
    (6 потоков) с circuit breaker. 100 «новых» товаров больше не дают
    100 × 5 с блокировки open_folder.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    todo: list[dict] = []
    for it in items:
        if not it.get('barcode'):
            continue
        r = state.lookup.find_local(it['barcode'], state.zayavka)
        if r['source'] is not None:
            _apply_lookup(it, r)
        else:
            todo.append(it)

    api_found = 0
    if todo and state.lookup.enabled and not state.lookup.api_down():
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=6, thread_name_prefix='apim') as ex:
            futs = {ex.submit(state.lookup.find_api, it['barcode']): it for it in todo}
            for f in as_completed(futs, timeout=120):
                it = futs[f]
                try:
                    r = f.result()
                except Exception:
                    r = None
                if r:
                    _apply_lookup(it, r)
                    api_found += 1
        log('enrich_api', session_id=session_id, total=len(todo), found=api_found,
            elapsed_ms=round((time.time() - t0) * 1000), api_down=state.lookup.api_down())
    for it in todo:
        if it['lookup_source'] is None:
            _apply_lookup(it, {'lm': None, 'name': None, 'source': None, 'row': None})


def ean13_ok(bc: str) -> bool:
    s = sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(bc[:12]))
    return (10 - s % 10) % 10 == int(bc[12])


def _agg_from_plan(rows: list[dict]) -> dict:
    agg: dict[str, dict] = {}
    for r in rows:
        it = next((x for x in state.items if x['id'] == r['item_id']), None)
        if it is None:
            continue
        a = agg.setdefault(r['item_id'], {
            'lm': it.get('lm_code'), 'gtin': it.get('barcode'),
            'name': it.get('product_name'), 'L': 0, 'M': 0,
        })
        if r['kind'] == 'label':
            a['M'] = 1
        else:
            a['L'] += 1
    return agg


# --- system -------------------------------------------------------------------
@method('system.heartbeat')
def h_heartbeat(p):
    state.last_beat = time.time()
    return {'ok': True, 'ts': time.time(), 'uptime': int(time.time() - START),
            'items': len(state.items)}


@method('system.info')
def h_info(p):
    d = state.demo_dir
    return {
        'version': VERSION,
        'port': state.port,
        'data_dir': str(state.data_dir),
        'demo': None if not d else {
            'raw_folder': str(d / 'shoot_2026-09-16'),
            'zayavka': str(d / 'zayavka_17.09.2026.xlsx'),
            'pim': str(d / 'export_pim_demo.csv'),
        },
        'cache_count': state.lookup.stats() if state.lookup else 0,
        'engines': scanner_engines(),
        'apim': {
            'env': getattr(state, 'api_env', 'preprod'),
            'enabled': getattr(state, 'api_enabled', True),
        },
    }


@method('system.set_apim')
def h_set_apim(p):
    """v3.1: смена окружения/режима APIM на лету («Настройки»).
    v3.3: значение сохраняется в settings.json и переживает перезапуск."""
    with LOCK:
        env = str(p.get('env', 'preprod'))
        if env not in ('preprod', 'prod'):
            raise RpcError(4000, 'Окружение: preprod или prod')
        enabled = bool(p.get('enabled', True))
        state.lookup = Lookup(state.data_dir, env=env,
                              customer_id=getattr(state, 'customer_id', '60071799'),
                              enabled=enabled)
        state.api_env, state.api_enabled = env, enabled
        s = load_settings()
        s['apim_env'] = env
        s['apim_enabled'] = enabled
        save_settings(s)
        log('set_apim', session_id=p.get('_session'), env=env, enabled=enabled)
        return {'env': env, 'enabled': enabled, 'cache': state.lookup.stats()}


# --- session ------------------------------------------------------------------
def _save_last_session() -> None:
    """v3.3: запомнить последнюю сессию для восстановления после перезапуска."""
    if state.folder is None:
        return
    try:
        p = state.data_dir / 'last_session.json'
        p.write_text(json.dumps({
            'folder': str(state.folder),
            'mode': state.mode,
            'zayavka': str(state.zayavka_path) if state.zayavka_path else None,
            'ts': time.strftime('%Y-%m-%d %H:%M:%S'),
        }, ensure_ascii=False), encoding='utf-8')
    except Exception as e:
        log('last_session_save', level='warn', error=str(e))


@method('session.open_folder')
def h_open_folder(p):
    folder = Path(p['folder']).expanduser()
    mode = p.get('mode', 'cv')
    t0 = time.time()
    with LOCK:
        if p.get('zayavka'):
            try:
                _set_zayavka(Path(p['zayavka']))
            except (FileNotFoundError, XlsxLockedError) as e:
                raise RpcError(4040, str(e))
        try:
            res = scan_folder(folder, mode=mode, preview_loader=_get_preview)
        except FileNotFoundError as e:
            raise RpcError(4004, str(e))
        except PermissionError:
            raise RpcError(4004, 'Нет доступа к папке — проверьте права macOS '
                                  '(Системные настройки → Приватность → Файлы и папки)')
        except OSError as e:
            # сетевое хранилище отвалилось, битая ФС и т.п.
            raise RpcError(4000, f'Не удалось прочитать папку: {e}')
        _enrich(res['items'])
        state.items = res['items']
        state.folder = folder
        state.mode = mode
        _save_last_session()
        log('open_folder', session_id=p.get('_session'), folder=folder.name,
            mode=mode, items=len(res['items']), frames=res['total_frames'],
            warnings=len(res['warnings']),
            elapsed_ms=round((time.time() - t0) * 1000))
        return {
            'folder': str(folder), 'mode': mode,
            'zayavka': str(state.zayavka_path) if state.zayavka_path else None,
            'items': state.items, 'total_frames': res['total_frames'],
            'warnings': res['warnings'],
        }


@method('session.get')
def h_get(p):
    with LOCK:
        return {
            'folder': str(state.folder) if state.folder else None,
            'mode': state.mode,
            'zayavka': str(state.zayavka_path) if state.zayavka_path else None,
            'items': state.items,
        }


@method('session.set_zayavka')
def h_set_zayavka(p):
    with LOCK:
        path = p.get('path')
        if not path:
            # v3.3: явное снятие заявки (path: null)
            state.zayavka = None
            state.zayavka_path = None
            _enrich(state.items)
            _save_last_session()
            return {'zayavka': None, 'items': state.items}
        try:
            _set_zayavka(Path(path))
        except (FileNotFoundError, XlsxLockedError) as e:
            raise RpcError(4040, str(e))
        _enrich(state.items)
        _save_last_session()
        return {'zayavka': str(state.zayavka_path), 'items': state.items}


@method('session.move_frame')
def h_move(p):
    with LOCK:
        it = _item(p['item_id'])
        fr = it['frames']
        i, j = int(p['from_idx']), int(p.get('to_idx', p.get('idx', p['from_idx'])))
        if not (0 <= i < len(fr) and 0 <= j < len(fr)):
            raise RpcError(4000, 'Индекс вне диапазона')
        fr.insert(j, fr.pop(i))
        return {'frames': fr}


@method('session.set_frame_suffix')
def h_suffix(p):
    with LOCK:
        it = _item(p['item_id'])
        i = int(p['idx'])
        if not (0 <= i < len(it['frames'])):
            raise RpcError(4000, 'Индекс вне диапазона')
        suf = (p.get('suffix') or '').strip()
        if suf:
            if not suf.startswith('_'):
                suf = '_' + suf
            if not re.fullmatch(r'_(?:\d{1,4}|com|pack|ins|tag)', suf):
                raise RpcError(4000, 'Допустимые суффиксы: _NN, _com, _pack, _ins, _tag')
        it['frames'][i]['suffix_custom'] = suf or None
        return {'frames': it['frames']}


@method('session.apply_barcode')
def h_apply_bc(p):
    with LOCK:
        it = _item(p['item_id'])
        bc = re.sub(r'\D', '', str(p['barcode']))
        if len(bc) != 13:
            raise RpcError(4000, 'Нужно ровно 13 цифр (EAN-13)')
        if not ean13_ok(bc):
            raise RpcError(4001, 'Контрольная цифра неверна — проверьте ШК')
        it['barcode'] = bc
        it['source'] = 'manual'
        if it['frames'] and not it['has_label']:
            it['frames'][0]['is_label'] = True
            it['has_label'] = True
        r = state.lookup.find(bc, state.zayavka)
        it['lm_code'] = r['lm']
        it['product_name'] = r.get('name')
        it['lookup_source'] = r['source']
        it['excel_row'] = r.get('row')
        it['is_new'] = r['source'] is None
        it['status'] = 'warn' if not it['has_label'] else 'ok'
        return {'item': it}


@method('session.refresh_angles')
def h_refresh_angles(p):
    """v3.2: Обновить количество ракурсов в заявке на основе реальных файлов.

    Сравнивает текущее кол-во кадров каждого товара с данными в заявке (L/M).
    Если в заявке написано 8 ракурсов, а по факту 5 — обновляет на 5.
    """
    with LOCK:
        if state.zayavka is None:
            raise RpcError(4000, 'Заявка не загружена')
        if not state.items:
            raise RpcError(4000, 'Нет товаров в сессии')

        updates = []
        for it in state.items:
            lm = it.get('lm_code')
            if not lm:
                continue
            # Считаем реальные ракурсы (без _y/label)
            n_clean = sum(1 for f in it['frames'] if not f.get('is_label'))
            has_label = any(f.get('is_label') for f in it['frames'])

            # Ищем строку в заявке
            row = state.zayavka.find_row(lm=lm)
            if row is None:
                continue

            old_l = state.zayavka.ws.cell(row, 12).value or 0
            old_m = state.zayavka.ws.cell(row, 13).value or 0
            new_l = n_clean
            new_m = 1 if has_label else 0

            if int(old_l) != new_l or int(old_m) != new_m:
                updates.append({
                    'lm': lm,
                    'row': row,
                    'old_L': int(old_l), 'new_L': new_l,
                    'old_M': int(old_m), 'new_M': new_m,
                })

        if not updates:
            return {'updated': 0, 'message': 'Все ракурсы актуальны'}

        # Записываем изменения
        for u in updates:
            state.zayavka.ws.cell(u['row'], 12, u['new_L'])
            state.zayavka.ws.cell(u['row'], 13, u['new_M'])

        try:
            state.zayavka.save_atomic()
        except XlsxLockedError as e:
            raise RpcError(4091, str(e))

        return {
            'updated': len(updates),
            'changes': updates,
        }


@method('lookup.find_sku')
def h_find(p):
    with LOCK:
        return state.lookup.find(str(p['barcode']), state.zayavka)


# --- zayavka -------------------------------------------------------------------
@method('zayavka.generate')
def h_zay(p):
    """v3.1: без полей фотограф/организация/дата (заполняются вручную в Excel).
    Организация фиксированно «photo production»; «Дата съемки» и «Фотограф»
    остаются пустыми; дата отражается в имени файла (сегодня, DD.MM.YYYY).
    `out_path` может быть каталогом (без расширения) — имя сформируется само."""
    csv_path = Path(p['csv_path']).expanduser()
    if not csv_path.is_file():
        raise RpcError(4004, f'Файл не найден: {csv_path.name}')
    date = p.get('date') or time.strftime('%d.%m.%Y')
    fmt = p.get('fmt', 'xlsx')
    if p.get('out_path'):
        out = Path(p['out_path']).expanduser()
        if out.suffix == '':
            out = out / f'zayavka_{date}.xlsx'
    else:
        out = state.data_dir / f'zayavka_{date}.xlsx'
    try:
        rows = read_pim(csv_path)
    except ValueError as e:
        raise RpcError(4000, str(e))
    except Exception as e:
        raise RpcError(4000, f'Ошибка чтения CSV: {type(e).__name__}: {e}')
    if not rows:
        raise RpcError(4004, 'Товары не распознаны — проверьте заголовки экспорта PIM')
    constants = {'org': 'photo production'}
    if fmt == 'csv':
        build_csv(rows, out.with_suffix('.csv'), constants)
    else:
        build_xlsx(rows, out.with_suffix('.xlsx'), constants)
    out = out.with_suffix('.csv' if fmt == 'csv' else '.xlsx')
    return {
        'out_path': str(out), 'count': len(rows), 'date': date,
        'preview': [{'lm': r['lm'], 'otdel': r['otdel'], 'name': r['name'],
                     'gtin': r['gtin'], 'model': r['model']} for r in rows[:100]],
    }


# --- renamer -------------------------------------------------------------------
@method('renamer.plan')
def h_plan(p):
    with LOCK:
        ids = p.get('item_ids')
        items = [it for it in state.items if (not ids or it['id'] in ids)]
        rows, skipped = [], []
        for it in items:
            if not it.get('lm_code'):
                skipped.append({'item_id': it['id'], 'barcode': it['barcode'],
                                'reason': 'нет ШК' if not it['barcode'] else 'нет кода LM'})
                continue
            rows.extend(plan_item(it, it['lm_code']))
        # v3.3: дублирующий код LM в заявке → два товара претендуют на одно имя
        seen: dict[str, list[str]] = {}
        for r in rows:
            seen.setdefault(r['dst'], []).append(r['item_id'])
        dups = {dst: ids for dst, ids in seen.items() if len(set(ids)) > 1}
        if dups:
            dst, ids = next(iter(dups.items()))
            by_id = {it['id']: it for it in state.items}
            lms = {str(by_id[i]['lm_code']) for i in ids if i in by_id}
            raise RpcError(4090,
                           f'Коллизия именования: {dst} — код LM {", ".join(sorted(map(str, lms)))} '
                           f'встречается у нескольких товаров. Проверьте дубли в заявке '
                           f'(колонка A).')
        return {'rows': rows, 'skipped': skipped,
                'xlsx': str(state.zayavka_path) if state.zayavka_path else None,
                'items_count': len(items) - len(skipped)}


@method('renamer.execute')
def h_exec(p):
    with LOCK:
        plan = h_plan(p)
        if not plan['rows']:
            raise RpcError(4000, 'Нечего переименовывать — товары без кода LM пропущены')
        base = state.folder
        pairs = [{'src': str(base / r['src']), 'dst': str(base / r['dst'])}
                 for r in plan['rows']]
        t0 = time.time()
        try:
            renamed_log = execute_rename(pairs)
        except RenameError as e:
            raise RpcError(4090, str(e))
        changed, locked, xlsx_msg = None, False, None
        if state.zayavka is not None:
            try:
                changed = state.zayavka.write_results(
                    list(_agg_from_plan(plan['rows']).values()),
                    {'org': 'photo production', 'photographer': 'Кирилл'})
            except XlsxLockedError as e:
                locked, xlsx_msg = True, str(e)
        entry = state.journal.add(renamed_log, plan['rows'], {
            'path': str(state.zayavka_path) if state.zayavka_path else None,
            'changed': changed, 'locked': locked,
        })
        log('rename_execute', session_id=p.get('_session'), renamed=len(renamed_log),
            xlsx_locked=locked, elapsed_ms=round((time.time() - t0) * 1000))
        return {
            'renamed': len(renamed_log),
            'xlsx': {'updated': sum(1 for c in (changed or []) if not c.get('added')),
                     'added': sum(1 for c in (changed or []) if c.get('added')),
                     'locked': locked, 'message': xlsx_msg},
            'journal_id': entry['id'],
        }


@method('renamer.undo')
def h_undo(p):
    with LOCK:
        e = state.journal.pop()
        if not e:
            raise RpcError(4004, 'Журнал пуст — нечего отменять')
        try:
            undo_res = undo_rename(e['files'])
            n = undo_res['restored']
        except RenameError as ex:
            state.journal.entries.append(e)
            state.journal._save()
            raise RpcError(4090, str(ex))
        if undo_res['missing']:
            log('undo_missing', session_id=p.get('_session'),
                missing=undo_res['missing'][:10], count=len(undo_res['missing']))
        xlsx_done = None
        x = e.get('xlsx') or {}
        ch = x.get('changed')
        if ch and x.get('path'):
            try:
                w = ExcelWorker(x['path'])
                for c in reversed(ch):
                    if c.get('added'):
                        w.ws.delete_rows(c['row'])
                    else:
                        w.ws.cell(c['row'], 12, c['old']['L'])
                        w.ws.cell(c['row'], 13, c['old']['M'])
                w.save_atomic()
                xlsx_done = {'restored': len(ch)}
            except XlsxLockedError as ex:
                xlsx_done = {'locked': True, 'message': str(ex)}
            except Exception as ex:
                xlsx_done = {'error': str(ex)}
        if state.folder is not None:
            try:
                scan_res = scan_folder(state.folder, state.mode, preview_loader=_get_preview)
                _enrich(scan_res['items'])
                state.items = scan_res['items']
            except Exception:
                pass
        return {'restored': n, 'missing': undo_res['missing'], 'xlsx': xlsx_done,
                'journal_id': e['id']}


@method('renamer.retry_xlsx')
def h_retry(p):
    """Повторить запись L/M в Excel после снятия блокировки (master §3)."""
    with LOCK:
        e = state.journal.last()
        if not e:
            raise RpcError(4004, 'Журнал пуст')
        if state.zayavka is None:
            raise RpcError(4000, 'Заявка не загружена')
        plan = e.get('plan') or []
        if not plan:
            raise RpcError(4000, 'В журнале нет плана записи в Excel')
        try:
            changed = state.zayavka.write_results(
                list(_agg_from_plan(plan).values()),
                {'org': 'photo production', 'photographer': 'Кирилл'})
        except XlsxLockedError as ex:
            raise RpcError(4091, str(ex))
        e['xlsx'] = {'path': str(state.zayavka_path), 'changed': changed, 'locked': False}
        state.journal._save()
        return {'written': len(changed)}


@method('renamer.journal')
def h_journal(p):
    with LOCK:
        return {'path': str(state.journal.path), 'entries': state.journal.entries[-50:]}


@method('renamer.journal_clear')
def h_journal_clear(p):
    """v3.1: «Настройки» → очистить журнал Undo."""
    with LOCK:
        n = state.journal.clear()
        return {'cleared': n}


# --- files ---------------------------------------------------------------------
@method('fs.is_dir')
def h_is_dir(p):
    """v3.3: для drag&drop — узнать, папка ли путь (без чтения содержимого)."""
    try:
        return {'is_dir': Path(str(p['path'])).expanduser().is_dir()}
    except Exception:
        return {'is_dir': False}


@method('file.download')
def h_dl(p):
    """v3.3: выдаются ТОЛЬКО файлы внутри каталога данных sidecar
    (защита от произвольного чтения файла через WebView)."""
    path = Path(p['path']).expanduser()
    if not path.is_file():
        raise RpcError(4004, 'Файл не найден')
    try:
        data_root = state.data_dir.resolve()
        real = path.resolve()
        if data_root not in real.parents and real.parent != data_root:
            raise RpcError(4003, 'Файл вне каталога данных — выдача запрещена')
    except (OSError, RuntimeError) as e:
        raise RpcError(4003, f'Не удалось разрешить путь: {e}')
    if path.stat().st_size > 25 * 1024 * 1024:
        raise RpcError(4000, 'Файл больше 25 МБ — не отдаётся через RPC')
    return {'name': path.name, 'data_b64': base64.b64encode(path.read_bytes()).decode()}


# --------------------------------------------------------------------------- http
@app.post('/rpc')
async def rpc(request: Request):
    session_id = request.headers.get('X-RRS-Session', None)
    try:
        body = await request.json()
    except Exception:
        log('rpc_parse_error', level='error', session_id=session_id)
        return JSONResponse({'jsonrpc': '2.0', 'id': None,
                             'error': {'code': -32700, 'message': 'parse error'}})
    mid = body.get('id')
    m = str(body.get('method', ''))
    params = body.get('params') or {}
    # session_id из заголовка подмешиваем в params (хендлеры читают p.get('_session'))
    if session_id and isinstance(params, dict) and '_session' not in params:
        params = {**params, '_session': session_id}
    fn = METHODS.get(m)
    if fn is None:
        log('rpc_unknown_method', level='warn', session_id=session_id, method=m)
        return JSONResponse({'jsonrpc': '2.0', 'id': mid,
                             'error': {'code': -32601, 'message': f'method not found: {m}'}})
    t0 = time.time()
    try:
        result = fn(params)
        log('rpc', session_id=session_id, method=m,
            result=summarize(result, 200),
            elapsed_ms=round((time.time() - t0) * 1000))
        return JSONResponse({'jsonrpc': '2.0', 'id': mid, 'result': result})
    except RpcError as e:
        log('rpc_error', level='warn', session_id=session_id, method=m,
            code=e.code, error=e.message,
            elapsed_ms=round((time.time() - t0) * 1000))
        return JSONResponse({'jsonrpc': '2.0', 'id': mid,
                             'error': {'code': e.code, 'message': e.message}})
    except (FileNotFoundError, ValueError, KeyError) as e:
        log('rpc_error', level='warn', session_id=session_id, method=m,
            error=str(e)[:300], elapsed_ms=round((time.time() - t0) * 1000))
        return JSONResponse({'jsonrpc': '2.0', 'id': mid,
                             'error': {'code': 4000, 'message': str(e)}})
    except Exception as e:
        traceback.print_exc()
        log('rpc_exception', level='error', session_id=session_id, method=m,
            error=f'{type(e).__name__}: {e}',
            stack=traceback.format_exc(limit=5),
            elapsed_ms=round((time.time() - t0) * 1000))
        return JSONResponse({'jsonrpc': '2.0', 'id': mid,
                             'error': {'code': -32000, 'message': f'{type(e).__name__}: {e}'}})


@app.post('/log')
async def ui_log(request: Request):
    """v3.3: приём логов фронтенда (батчами). Корреляция по session_id."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({'error': 'parse error'}, status_code=400)
    lines = body.get('lines') or []
    if not isinstance(lines, list) or len(lines) > 500:
        return JSONResponse({'error': 'lines: список до 500 записей'}, status_code=400)
    n = 0
    for ln in lines:
        if not isinstance(ln, dict):
            continue
        LOG.log(
            str(ln.get('action', 'ui'))[:80],
            level=str(ln.get('level', 'info'))[:8],
            role='ui',
            session_id=str(ln.get('session_id', ''))[:64],
            **{k: v for k, v in ln.items() if k in ('params', 'result', 'error', 'extra', 'ui_state')}
        )
        n += 1
    return {'ok': True, 'written': n}


UPLOAD_MAX = 400 * 1024 * 1024  # v3.3: ограничение на файл (400 МБ)


@app.post('/upload')
async def upload(file: UploadFile = File(...), dir: str = Form('')):
    """Приём файла в data-dir/uploads[/<dir>].

    v3.2.2: необязательный `dir` — подпапка uploads (имя папки съёмки),
    чтобы браузерный выбор папки сохранял структуру партии.
    v3.3: санитизация + лимит размера (поток, без полной загрузки в RAM).
    """
    name = os.path.basename((file.filename or 'upload.bin').replace('\x00', ''))
    if not name:
        return JSONResponse({'error': 'Пустое имя файла'}, status_code=400)
    base = state.data_dir / 'uploads'
    d = (dir or '').strip().replace('\\', '/').replace('\x00', '')
    if d:
        if (d in ('.', '..') or '/' in d or d.startswith('.') or len(d) > 80
                or not re.fullmatch(r'[A-Za-z0-9._\- ]+', d)):
            return JSONResponse({'error': 'Недопустимое имя папки'}, status_code=400)
        base = base / d
    dest = base / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    try:
        with open(dest, 'wb') as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > UPLOAD_MAX:
                    out.close()
                    dest.unlink(missing_ok=True)
                    return JSONResponse(
                        {'error': f'Файл больше {UPLOAD_MAX // (1024*1024)} МБ'},
                        status_code=413)
                out.write(chunk)
    except OSError as e:
        dest.unlink(missing_ok=True)
        return JSONResponse({'error': f'Не удалось сохранить файл: {e}'}, status_code=500)
    log('upload', session_id=None, name=name, dir=d or None, size=size)
    return {'path': str(dest), 'name': name, 'size': size}


@app.get('/preview/{fh}')
def preview(fh: str, size: int = 320):
    size = max(64, min(int(size), 4096))
    path = state.file_registry.get(fh)
    if path is None or not path.is_file():
        return JSONResponse({'error': 'not found'}, status_code=404)
    prev = state.preview_cache_get(fh) if hasattr(state, 'preview_cache_get') else PREV_CACHE.get(fh)
    if prev is None:
        prev = _get_preview(path)
    if prev is None:
        return JSONResponse({'error': 'no embedded preview'}, status_code=404)
    key = (fh, size)
    thumb = THUMB_CACHE.get(key)
    if thumb is None:
        try:
            thumb = make_jpeg_thumb(prev, size)
        except Exception as e:
            # v3.3: битое встроенное превью — 404 вместо 500/краха
            log('preview_bad_jpeg', level='warn', file=str(path.name), error=str(e)[:200])
            return JSONResponse({'error': 'bad embedded preview'}, status_code=404)
        if len(THUMB_CACHE) > 500:
            THUMB_CACHE.pop(next(iter(THUMB_CACHE)))
        THUMB_CACHE[key] = thumb
    return Response(thumb, media_type='image/jpeg',
                    headers={'Cache-Control': 'public, max-age=86400'})


@app.get('/health')
def health():
    return {'ok': True, 'version': VERSION, 'port': state.port}


# --------------------------------------------------------------------------- main
def _say(msg: str) -> None:
    """Печать в stdout (Rust читает SIDECAR_READY из этого потока).

    BUG-013: при выходе из приложения Rust закрывает pipe — без защиты
    print() в фоновых потоках падал с BrokenPipeError (traceback в stderr).
    """
    try:
        print(msg, flush=True)
    except (BrokenPipeError, OSError):
        return


def _watchdog(timeout: float) -> None:
    while True:
        time.sleep(1.0)
        if time.time() - state.last_beat > timeout:
            _say('SIDECAR: нет heartbeat дольше '
                 f'{timeout:.0f} c — exit(0)')
            os._exit(0)


def _restore_last_session() -> None:
    """v3.3: восстановить последнюю сессию (папка + заявка) после рестарта."""
    p = state.data_dir / 'last_session.json'
    try:
        d = json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        return
    folder = Path(d.get('folder') or '')
    if not folder.is_dir():
        log('restore_session', level='warn', error='папка не найдена', folder=d.get('folder'))
        return
    try:
        if d.get('zayavka'):
            zp = Path(d['zayavka'])
            if zp.is_file():
                _set_zayavka(zp)
        res = scan_folder(folder, mode=d.get('mode', 'cv'), preview_loader=_get_preview)
        _enrich(res['items'])
        state.items = res['items']
        state.folder = folder
        state.mode = d.get('mode', 'cv')
        log('restore_session', folder=folder.name, items=len(res['items']))
    except Exception as e:
        log('restore_session', level='error', error=f'{type(e).__name__}: {e}')


def main() -> None:
    global LOG, RUN_ID
    ap = argparse.ArgumentParser(description='RAW Renamer Studio sidecar')
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=0, help='0 = случайный свободный порт')
    ap.add_argument('--port-file', default=None)
    ap.add_argument('--data-dir', default=None)
    ap.add_argument('--zayavka', default=None)
    ap.add_argument('--demo-folder', default=None)
    ap.add_argument('--api-env', default=None, choices=['preprod', 'prod'],
                    help='по умолчанию — из settings.json')
    ap.add_argument('--api-enabled', default=None, help='0/1; по умолчанию — из settings.json')
    ap.add_argument('--customer-id', default=None)
    ap.add_argument('--watchdog', type=float, default=8.0,
                    help='секунд без heartbeat до exit(0); 0 = выключен')
    a = ap.parse_args()

    if a.data_dir:
        state.data_dir = Path(a.data_dir).expanduser()
    elif sys.platform == 'win32':
        state.data_dir = (Path(os.environ.get('LOCALAPPDATA', str(Path.home())))
                          / 'RAW-Renamer-Studio')
    elif sys.platform == 'darwin':
        state.data_dir = (Path.home() / 'Library' / 'Application Support'
                          / 'RAW Renamer Studio')
    else:
        state.data_dir = Path.home() / '.cache' / 'raw-renamer'
    state.data_dir.mkdir(parents=True, exist_ok=True)

    LOG = RrsLog(state.data_dir)
    RUN_ID = LOG.run_id
    log('sidecar_start', version=VERSION, data_dir=str(state.data_dir),
        python=sys.version.split()[0], pid=os.getpid())

    # --- настройки: CLI > settings.json > дефолты -----------------------------
    s = load_settings()
    api_env = a.api_env or s.get('apim_env', 'preprod')
    api_enabled = (a.api_enabled == '1') if a.api_enabled is not None \
        else bool(s.get('apim_enabled', True))
    customer_id = a.customer_id or s.get('customer_id', '60071799')
    state.demo_dir = Path(a.demo_folder).expanduser().resolve() if a.demo_folder else None
    state.lookup = Lookup(state.data_dir, env=api_env, customer_id=customer_id,
                          enabled=api_enabled)
    state.api_env = api_env
    state.api_enabled = api_enabled
    state.customer_id = customer_id
    state.journal = Journal(state.data_dir / '.lm_rename_journal.json')
    state.last_beat = time.time()
    if a.zayavka:
        try:
            _set_zayavka(Path(a.zayavka).expanduser())
        except (FileNotFoundError, XlsxLockedError) as e:
            print(f'SIDECAR: заявка недоступна: {e}', file=sys.stderr, flush=True)

    # v3.3: восстановление последней сессии (до READY — фронт сразу видит данные)
    _restore_last_session()

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind((a.host, a.port))
    port = sock.getsockname()[1]
    sock.set_inheritable(True)
    state.port = port

    if a.watchdog > 0:
        threading.Thread(target=_watchdog, args=(a.watchdog,), daemon=True).start()

    # v3.3: READY объявляется ТОЛЬКО когда uvicorn реально принимает запросы
    # (раньше порт-файл/READY писались до accept → первый RPC мог получить
    # ConnectionRefused). Порт-файл пишется в тот же момент — dev-прокси
    # гарантированно попадает в живой сервер.
    config = uvicorn.Config(app, host=a.host, port=port,
                            log_level='warning', access_log=False)
    server = uvicorn.Server(config)

    def _announce():
        while not server.started:
            time.sleep(0.05)
        if a.port_file:
            pf = Path(a.port_file)
            pf.parent.mkdir(parents=True, exist_ok=True)
            try:
                pf.write_text(str(port))
            except OSError as e:
                print(f'SIDECAR: не удалось записать port-file: {e}', file=sys.stderr, flush=True)
        _say(json.dumps({'event': 'SIDECAR_READY', 'port': port, 'pid': os.getpid()},
                        ensure_ascii=False))
        log('sidecar_ready', port=port)

    threading.Thread(target=_announce, daemon=True).start()
    server.run(sockets=[sock])


if __name__ == '__main__':
    main()
