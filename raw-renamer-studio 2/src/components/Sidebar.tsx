import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  CalendarDays, FileSpreadsheet, FolderOpen, Camera, History, FileText,
  Database, Undo2, Settings, Plus, PanelLeftClose, Loader2,
} from 'lucide-react';
import { useSession, errMsg } from '../store/useSession';
import * as sc from '../lib/sidecar';
import { cx } from '../lib/cx';

/** Нативный выбор папки в Tauri; в браузере — подсказка. */
export async function pickFolder(): Promise<void> {
  try {
    const w = window as unknown as { __TAURI_INTERNALS__?: unknown };
    if (w.__TAURI_INTERNALS__) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const dir = await open({ directory: true, multiple: false, title: 'Папка с RAW-файлами съёмки' });
      if (typeof dir === 'string') {
        void useSession.getState().openFolder(dir);
      }
      return;
    }
  } catch {
    /* нет tauri */
  }
  useSession
    .getState()
    .toast(
      'warn',
      'Десктопный режим',
      'Нативный выбор папки доступен в десктопной сборке (Tauri). В браузере — «Демо-партия».',
    );
}

function SideLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-3 pb-1.5 px-2 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-tx-3">
      {children}
    </div>
  );
}

const itemCls =
  'flex items-center gap-2.5 w-full px-2 py-[7px] rounded-md text-[13px] text-tx-2 hover:bg-surface-hover hover:text-tx-1 transition-colors text-left';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const session = useSession((s) => s.session);
  const info = useSession((s) => s.info);
  const openDemo = useSession((s) => s.openDemo);
  const busy = useSession((s) => s.busy);
  const toast = useSession((s) => s.toast);
  const undoLast = useSession((s) => s.undoLast);
  const setModal = useSession((s) => s.setModal);

  const showJournal = async () => {
    try {
      const r = await sc.rpc<{
        path: string;
        entries: { id: string; ts: string; files: { from: string; to: string }[] }[];
      }>('renamer.journal', {});
      const last = r.entries[r.entries.length - 1];
      toast(
        'info',
        'Журнал операций',
        last
          ? `${r.entries.length} в журнале · последняя: ${last.ts} (${last.files.length} файлов)`
          : `Журнал пуст · ${r.path}`,
      );
    } catch (e) {
      toast('err', 'Ошибка', errMsg(e));
    }
  };

  const folderName = session?.folder
    ? session.folder.split(/[\\/]/).filter(Boolean).pop() ?? ''
    : '';

  return (
    <aside
      className={cx(
        'w-[248px] flex-shrink-0 bg-panel border-r border-white/5 flex flex-col min-h-0 transition-all duration-200 overflow-hidden',
        collapsed && '-ml-[248px] opacity-0 pointer-events-none',
      )}
    >
      <div className="flex-1 overflow-y-auto px-2.5 py-3">
        <SideLabel>
          Сессии
          <button
            onClick={() => void pickFolder()}
            className="w-5 h-5 grid place-items-center rounded hover:bg-elevated text-tx-3 hover:text-tx-1"
            title="Новая партия"
          >
            <Plus size={13} />
          </button>
        </SideLabel>
        {session?.folder ? (
          <button
            className={cx(
              itemCls,
              'bg-accent-tint text-accent-text font-semibold border border-accent/25 hover:bg-accent/20',
            )}
          >
            <CalendarDays size={16} className="flex-shrink-0" />
            <span className="truncate">{folderName}</span>
            <span className="ml-auto text-[10.5px] font-mono font-semibold bg-accent text-base px-1.5 rounded-full">
              {session.items.length}
            </span>
          </button>
        ) : (
          <button className={cx(itemCls, 'text-tx-3')}>
            <CalendarDays size={16} className="flex-shrink-0" />
            Партия не открыта
          </button>
        )}

        <SideLabel>Подготовка</SideLabel>
        <button
          className={cx(itemCls, 'text-accent-text')}
          onClick={() => setModal('zayavka', true)}
        >
          <FileSpreadsheet size={16} className="flex-shrink-0" />
          Генератор заявки
          <span className="ml-auto text-[10px] font-bold font-mono bg-accent-tint text-accent-text border border-accent/25 px-1.5 rounded-full">
            PIM
          </span>
        </button>
        <button className={itemCls} onClick={() => void pickFolder()}>
          <FolderOpen size={16} className="flex-shrink-0" />
          Открыть папку…
        </button>
        {info?.demo && (
          <button className={itemCls} onClick={() => void openDemo()}>
            <Camera size={16} className="flex-shrink-0" />
            Демо-партия
            <span className="ml-auto text-[10px] font-mono text-tx-3">6 товаров</span>
          </button>
        )}
        {busy && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-tx-3">
            <Loader2 size={13} className="animate-spin" />
            обработка…
          </div>
        )}

        <SideLabel>Журнал</SideLabel>
        <button className={itemCls} onClick={() => void showJournal()}>
          <History size={16} className="flex-shrink-0" />
          Операции
        </button>
        <button
          className={itemCls}
          onClick={() =>
            toast(
              'info',
              'Журнал Excel',
              'Обратная запись: L (12) — ракурсы, M (13) — флаг _y после именования',
            )
          }
        >
          <FileText size={16} className="flex-shrink-0" />
          Журнал Excel
        </button>
        <button
          className={itemCls}
          onClick={() =>
            toast(
              'info',
              'Кэш ШК → Артикул',
              info ? `SQLite: ${info.cache_count} записей` : 'sidecar offline',
            )
          }
        >
          <Database size={16} className="flex-shrink-0" />
          Кэш ШК
        </button>
        <button className={itemCls} onClick={() => void undoLast()}>
          <Undo2 size={16} className="flex-shrink-0" />
          Откат (Undo)
        </button>

        <SideLabel>Служебное</SideLabel>
        <button className={itemCls} onClick={() => setModal('settings', true)}>
          <Settings size={16} className="flex-shrink-0" />
          Настройки
        </button>
      </div>
      <div className="px-3 py-2.5 border-t border-white/5">
        <button
          onClick={() => setCollapsed(true)}
          className="w-full h-8 rounded-md bg-elevated text-tx-1 text-xs font-semibold hover:bg-[#2F333F] flex items-center justify-center gap-1.5"
        >
          <PanelLeftClose size={14} />
          Свернуть
        </button>
      </div>
    </aside>
  );
}
