"""RAW Renamer Studio — компактное структурированное логирование sidecar.

Формат (master: раздел «Логирование», v3.3):
  * JSONL (по одной JSON-записи на строку) в data_dir/logs/sidecar.jsonl;
  * ротация: при достижении MAX_BYTES текущий файл сжимается в .1.gz,
    предыдущие сдвигаются (.1.gz → .2.gz …), хранится KEEP архивов;
  * записи читаются человеком и ИИ-агентом (logcat.py декодирует архивы).

Поля записи:
  ts           ISO-8601 (локальное время)
  level        info | warn | error
  role         sidecar | ui           (ui — строки, принятые из фронтенда через /log)
  session_id   идентификатор сессии фронтенда (корреляция)
  run_id       id процесса sidecar (корреляция перезапусков)
  action       короткое имя действия (open_folder, execute, …)
  method       имя RPC-метода (для role=sidecar, action=rpc)
  params       параметры (усечённые до ~400 символов)
  result       краткий результат / статус (число, код, имя файла)
  error        текст ошибки (если есть)
  stack        traceback (если есть)
  elapsed_ms   длительность операции (если измерена)
  extra        произвольные поля (size, count, folder, …)
"""
from __future__ import annotations

import gzip
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Optional

MAX_BYTES = 5 * 1024 * 1024   # 5 МБ на активный файл
KEEP = 3                      # хранить 3 сжатых архива
_PARAM_LIMIT = 400


class RrsLog:
    def __init__(self, base_dir: Path):
        """base_dir — каталог данных; логи пишутся в base_dir/logs/."""
        self.dir = Path(base_dir) / 'logs'
        self.dir.mkdir(parents=True, exist_ok=True)
        self.path = self.dir / 'sidecar.jsonl'
        self.run_id = uuid.uuid4().hex[:10]
        self._fh = self.path.open('a', encoding='utf-8', buffering=1)

    # ------------------------------------------------------------------ write
    def log(self, action: str, level: str = 'info',
            session_id: Optional[str] = None, role: str = 'sidecar', **extra: Any) -> None:
        entry = {
            'ts': time.strftime('%Y-%m-%dT%H:%M:%S') + f'.{int(time.time()*1000)%1000:03d}',
            'level': level,
            'role': role,
            'run_id': self.run_id,
            'action': action,
        }
        if session_id:
            entry['session_id'] = session_id
        entry.update(extra)
        try:
            line = json.dumps(entry, ensure_ascii=False, default=str)
            self._fh.write(line + '\n')
            self._maybe_rotate()
        except Exception:
            # логирование никогда не роняет приложение
            try:
                self._fh.write(json.dumps({'ts': entry['ts'], 'level': 'warn',
                                           'action': 'log_failed',
                                           'error': 'не удалось записать запись'},
                                          ensure_ascii=False) + '\n')
            except Exception:
                pass

    # ---------------------------------------------------------------- rotate
    def _archive(self, i: int) -> Path:
        return self.path.parent / f'{self.path.name}.{i}.gz'

    def _maybe_rotate(self) -> None:
        try:
            if self.path.stat().st_size < MAX_BYTES:
                return
        except FileNotFoundError:
            return
        self._fh.close()
        self._archive(KEEP).unlink(missing_ok=True)
        for i in range(KEEP - 1, 0, -1):
            self._archive(i).replace(self._archive(i + 1)) if self._archive(i).exists() else None
        with open(self.path, 'rb') as fin, gzip.open(self._archive(1), 'wb') as fout:
            fout.writelines(fin)
        self.path.unlink(missing_ok=True)
        self._fh = self.path.open('a', encoding='utf-8', buffering=1)

    def close(self) -> None:
        try:
            self._fh.close()
        except Exception:
            pass


# --------------------------------------------------------------------- helper
def summarize(obj: Any, limit: int = _PARAM_LIMIT) -> str:
    """Компактное текстовое представление для лога (без разрастания)."""
    try:
        s = json.dumps(obj, ensure_ascii=False, default=str)
    except Exception:
        s = str(obj)
    if len(s) > limit:
        s = s[:limit] + f'…(+{len(s) - limit})'
    return s
