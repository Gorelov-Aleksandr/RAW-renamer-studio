"""RAW Renamer Studio — Safe Two-Phase Rename + Undo Journal (master §13.5).

Правила:
  * сначала проверка коллизий (dst уже существует — ошибка, кроме случая,
    когда dst сам является src — цикл 1→2, 2→1);
  * при циклических переименованиях — двухфазный переход через промежуточный
    суффикс .tmp_rename;
  * журнал .lm_rename_journal.json — 1-Click Undo (файлы + ячейки L/M).
"""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Optional

TMP = '.tmp_rename'


class RenameError(Exception):
    pass


def execute(pairs: list[dict]) -> list[dict]:
    """pairs: [{'src': str|Path, 'dst': str|Path}].

    Возвращает лог [{'from','to'}] (для журнала). Бросает RenameError.
    Всегда выполняется двухфазно через .tmp_rename с гарантированным rollback
    при любой ошибке.
    """
    if not pairs:
        return []
    srcs = [Path(p['src']) for p in pairs]
    dsts = [Path(p['dst']) for p in pairs]

    # 1. Проверка существования всех исходных файлов
    for s in srcs:
        if not s.is_file():
            raise RenameError(f'Файл не найден: {s.name}')

    # 2. Проверка дубликатов целевых имен внутри плана
    seen_dst: set[Path] = set()
    for d in dsts:
        d_res = d.resolve()
        if d_res in seen_dst:
            raise RenameError(f'Коллизия в плане: два файла претендуют на одно имя {d.name}')
        seen_dst.add(d_res)

    # 3. Проверка коллизий с посторонними файлами на диске
    src_set = {s.resolve() for s in srcs}
    for d in dsts:
        if d.exists() and d.resolve() not in src_set:
            raise RenameError(f'Коллизия: {d.name} уже существует на диске')

    # 4. Двухфазное переименование с гарантированным rollback
    # Фаза 1: src -> tmp
    tmps: list[tuple[Path, Path, Path]] = []
    uid = uuid.uuid4().hex[:6]
    phase1_done: list[tuple[Path, Path]] = []
    try:
        for s, d in zip(srcs, dsts):
            t = s.with_name(f"{s.name}.{uid}{TMP}")
            if t.exists():
                raise RenameError(f'Остаточный временный файл: {t.name}')
            s.rename(t)
            phase1_done.append((s, t))
            tmps.append((s, t, d))
    except Exception as e:
        # Откат первой фазы: все перемещенные s -> t возвращаем назад
        for s, t in reversed(phase1_done):
            try:
                if t.exists():
                    t.rename(s)
            except OSError:
                pass
        if isinstance(e, RenameError):
            raise
        raise RenameError(f'Ошибка подготовки переименования: {e}')

    # Фаза 2: tmp -> dst
    phase2_done: list[tuple[Path, Path, Path]] = []
    try:
        for s, t, d in tmps:
            if d.exists():
                raise RenameError(f'Коллизия: {d.name} уже существует')
            t.rename(d)
            phase2_done.append((s, t, d))
    except Exception as e:
        # Откат второй фазы:
        # Завершенные t -> d откатываем обратно в s
        for s, _t, d in reversed(phase2_done):
            try:
                if d.exists():
                    d.rename(s)
            except OSError:
                pass
        # Еще не перемещенные t откатываем обратно в s
        done_tmps = {t for _, t, _ in phase2_done}
        for s, t, _d in tmps:
            if t not in done_tmps and t.exists():
                try:
                    t.rename(s)
                except OSError:
                    pass
        if isinstance(e, RenameError):
            raise
        raise RenameError(f'Не удалось завершить переименование: {e}')

    return [{'from': str(s), 'to': str(d)} for s, d in zip(srcs, dsts)]


def undo_rename(files: list[dict]) -> dict:
    """Откат: to → from (в обратном порядке), двухфазно-безопасно.

    v3.3: возвращает {'restored': n, 'missing': [имена]} — файлы, которых
    физически нет на диске (удалены пользователем), прогоняются явно.
    """
    pairs = []
    missing: list[str] = []
    for f in reversed(files):
        s, d = Path(f['to']), Path(f['from'])
        if s.is_file():
            pairs.append({'src': str(s), 'dst': str(d)})
        else:
            missing.append(s.name)
    if not pairs:
        return {'restored': 0, 'missing': missing}
    return {'restored': len(execute(pairs)), 'missing': missing}


JOURNAL_MAX = 100  # v3.3: журнал не растёт бесконечно (старики отбрасываются)


class Journal:
    """Журнал операций .lm_rename_journal.json (атомарная запись)."""

    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.entries: list[dict] = []
        if self.path.exists():
            try:
                self.entries = json.loads(self.path.read_text(encoding='utf-8'))
            except Exception:
                self.entries = []

    def add(self, files: list[dict], plan: list[dict], xlsx: Optional[dict]) -> dict:
        e = {
            'id': uuid.uuid4().hex[:12],
            'ts': time.strftime('%Y-%m-%d %H:%M:%S'),
            'files': files,
            'plan': plan,
            'xlsx': xlsx,
        }
        self.entries.append(e)
        overflow = len(self.entries) - JOURNAL_MAX
        if overflow > 0:
            self.entries = self.entries[overflow:]  # отбрасываем старейшие
        self._save()
        return e

    def last(self) -> Optional[dict]:
        return self.entries[-1] if self.entries else None

    def pop(self) -> Optional[dict]:
        if not self.entries:
            return None
        e = self.entries.pop()
        self._save()
        return e

    def clear(self) -> int:
        """Полная очистка журнала (v3.1, «Настройки»). Возвращает число удалённых."""
        n = len(self.entries)
        self.entries = []
        self._save()
        return n

    def _save(self) -> None:
        tmp = self.path.with_name(self.path.name + '.tmp')
        tmp.write_text(json.dumps(self.entries, ensure_ascii=False, indent=1), encoding='utf-8')
        os.replace(tmp, self.path)
