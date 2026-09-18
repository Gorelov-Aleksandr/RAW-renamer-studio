#!/usr/bin/env python3
"""logcat — просмотр/декодирование логов RAW Renamer Studio.

Логи: <data-dir>/logs/sidecar.jsonl (+ ротация .1.gz … .3.gz, gzip).

Примеры:
  python3 tools/logcat.py                          # последние 100 строк
  python3 tools/logcat.py --level error            # только ошибки
  python3 tools/logcat.py --action execute         # фильтр по действию
  python3 tools/logcat.py --session 3f9a…          # по session_id (UI ↔ sidecar)
  python3 tools/logcat.py --since 18:30            # после времени (чч:мм)
  python3 tools/logcat.py --table                  # компактная таблица
  python3 tools/logcat.py --data-dir ~/Library/Application\\ Support/RAW\\ Renamer\\ Studio

Для ИИ-анализа: вывод — JSON Lines (каждая строка — полная запись),
поэтому лог можно парсить как `for line in output: json.loads(line)`.
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
import time
from pathlib import Path

DEFAULT_DATA_DIRS = [
    Path.home() / 'Library' / 'Application Support' / 'RAW Renamer Studio',  # macOS
    Path.home() / '.cache' / 'raw-renamer',                                  # Linux
]


def find_log_dir(data_dir: str | None) -> Path:
    if data_dir:
        p = Path(data_dir).expanduser() / 'logs'
        if not p.is_dir():
            sys.exit(f'каталог логов не найден: {p}')
        return p
    for d in DEFAULT_DATA_DIRS:
        if (d / 'logs').is_dir():
            return d / 'logs'
    sys.exit('каталог логов не найден — укажите --data-dir')


def iter_entries(log_dir: Path):
    """Все записи: архивы (старые) + активный файл, в хронологическом порядке."""
    archives = sorted(
        (a for a in log_dir.glob('sidecar.jsonl.*.gz')),
        key=lambda a: int(a.name.rsplit('.', 2)[-2]),  # .1.gz → 1
    )
    for a in archives:
        try:
            with gzip.open(a, 'rt', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        yield from _parse(line)
        except Exception as e:
            print(f'[logcat] не удалось прочитать {a.name}: {e}', file=sys.stderr)
    cur = log_dir / 'sidecar.jsonl'
    if cur.exists():
        with open(cur, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    yield from _parse(line)


def _parse(line: str):
    try:
        yield json.loads(line)
    except Exception:
        yield {'ts': '?', 'level': 'warn', 'action': 'unreadable', 'raw': line[:200]}


def main() -> None:
    ap = argparse.ArgumentParser(description='Просмотр логов RAW Renamer Studio')
    ap.add_argument('--data-dir', help='каталог данных (содержит logs/)')
    ap.add_argument('--level', choices=['info', 'warn', 'error'], default=None)
    ap.add_argument('--action', default=None, help='фильтр по action (подстрока)')
    ap.add_argument('--method', default=None, help='фильтр по RPC-методу (подстрока)')
    ap.add_argument('--session', default=None, help='фильтр по session_id (подстрока)')
    ap.add_argument('--role', choices=['sidecar', 'ui'], default=None)
    ap.add_argument('--since', default=None, help='время ЧЧ:ММ сегодня (локальное)')
    ap.add_argument('--tail', type=int, default=100, help='сколько последних строк (0=все)')
    ap.add_argument('--table', action='store_true', help='компактная таблица вместо JSONL')
    args = ap.parse_args()

    log_dir = find_log_dir(args.data_dir)

    since = None
    if args.since:
        h, m = args.since.split(':')
        since = time.strftime('%Y-%m-%dT%H') + f':{int(m):02d}:00'

    entries = list(iter_entries(log_dir))
    filtered = []
    for e in entries:
        if args.level and e.get('level') != args.level:
            continue
        if args.action and args.action not in str(e.get('action', '')):
            continue
        if args.method and args.method not in str(e.get('method', '')):
            continue
        if args.session and args.session not in str(e.get('session_id', '')):
            continue
        if args.role and e.get('role') != args.role:
            continue
        if since and str(e.get('ts', '')) < since:
            continue
        filtered.append(e)

    shown = filtered[-args.tail:] if args.tail > 0 else filtered

    if args.table:
        for e in shown:
            ts = str(e.get('ts', '?'))[11:19]
            lvl = {'info': '·', 'warn': '!', 'error': '✗'}.get(e.get('level'), '?')
            role = 'ui' if e.get('role') == 'ui' else 'sc'
            sess = str(e.get('session_id', ''))[:6]
            act = f"{e.get('action', '')} {e.get('method', '')}".strip()
            res = e.get('result', '')
            err = e.get('error', '')
            el = e.get('elapsed_ms')
            line = f'{ts} {lvl} [{role} {sess}] {act}'
            if el is not None:
                line += f' {el}ms'
            if err:
                line += f' ERR: {str(err)[:120]}'
            elif res not in (None, '', 'ok'):
                line += f' → {str(res)[:120]}'
            print(line)
    else:
        for e in shown:
            print(json.dumps(e, ensure_ascii=False))

    print(f'[logcat] {log_dir}: показано {len(shown)} из {len(entries)} записей',
          file=sys.stderr)


if __name__ == '__main__':
    main()
