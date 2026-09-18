import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  CalendarDays, FileSpreadsheet, FolderOpen, Camera, History, FileText,
  Database, Undo2, Settings, Plus, PanelLeftClose, Loader2,
} from 'lucide-react';
import { useSession } from '../store/useSession';
import { pickFolder, type PickProgress } from '../lib/pickFolder';
import { showJournalSummary } from '../lib/ops';
import { cx } from '../lib/cx';

function SideLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-3 pb-1.5 px-2 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-tx-3">
      {children}
    </div>
  );
}

const itemCls =
  'flex items-center gap-2.5 w-full px-2 py-[7px] rounded-md text-[13px] text-tx-2 hover:bg-surface-hover hover:text-tx-1 transition-colors text-left';

const OFFLINE_TITLE = 'Sidecar офлайн — операция недоступна';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [upload, setUpload] = useState<PickProgress | null>(null);
  const session = useSession((s) => s.session);
  const info = useSession((s) => s.info);
  const online = useSession((s) => s.online);
  const openDemo = useSession((s) => s.openDemo);
  const busy = useSession((s) => s.busy);
  const toast = useSession((s) => s.toast);
  const undoLast = useSession((s) => s.undoLast);
  const setModal = useSession((s) => s.setModal);

  const showJournal = async () => {
    // BUG-006: когда sidecar онлайн — реальные данные из renamer.journal
    await showJournalSummary();
  };

  const newBatch = () => {
    // BUG-001/BUG-005: Tauri — нативный проводник; браузер — выбор папки
    // + загрузка RAW в sidecar + открытие сессии
    void pickFolder({
      onProgress: (p) => setUpload(p),
      onDone: () => setUpload(null),
    });
  };

  const folderName = session?.folder
    ? session.folder.split(/[\\/]/).filter(Boolean).pop() ?? ''
    : '';

  const offCls = !online ? 'opacity-40 cursor-not-allowed pointer-events-none' : '';

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
            onClick={newBatch}
            disabled={!online}
            title={online ? 'Новая партия: выбрать папку с RAW-файлами' : OFFLINE_TITLE}
            className={cx(
              'w-5 h-5 grid place-items-center rounded hover:bg-elevated text-tx-3 hover:text-tx-1',
              !online && 'opacity-40 cursor-not-allowed',
            )}
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
          <button className={cx(itemCls, 'text-tx-3')} onClick={newBatch}>
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
        <button className={cx(itemCls, offCls)} onClick={newBatch} disabled={!online} title={online ? 'Выбрать папку с RAW-файлами съёмки' : OFFLINE_TITLE}>
          <FolderOpen size={16} className="flex-shrink-0" />
          Открыть папку…
        </button>
        {info?.demo && (
          <button className={cx(itemCls, offCls)} onClick={() => void openDemo()} disabled={!online} title={online ? undefined : OFFLINE_TITLE}>
            <Camera size={16} className="flex-shrink-0" />
            Демо-партия
            <span className="ml-auto text-[10px] font-mono text-tx-3">6 товаров</span>
          </button>
        )}
        {upload && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-tx-3">
            <Loader2 size={13} className="animate-spin" />
            <span className="truncate">
              Загрузка RAW {upload.done}/{upload.total}
            </span>
          </div>
        )}
        {!upload && busy && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-tx-3">
            <Loader2 size={13} className="animate-spin" />
            обработка…
          </div>
        )}

        <SideLabel>Журнал</SideLabel>
        <button className={cx(itemCls, offCls)} onClick={showJournal} disabled={!online} title={online ? 'Сводка по журналу операций' : OFFLINE_TITLE}>
          <History size={16} className="flex-shrink-0" />
          Операции
        </button>
        <button
          className={cx(itemCls, offCls)}
          disabled={!online}
          title={
            online
              ? 'Обратная запись: L (12) — ракурсы, M (13) — флаг _y после именования'
              : OFFLINE_TITLE
          }
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
          className={cx(itemCls, offCls)}
          disabled={!online}
          title={online ? undefined : OFFLINE_TITLE}
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
        <button className={cx(itemCls, offCls)} onClick={() => void undoLast()} disabled={!online} title={online ? 'Отменить последнее переименование (⌘Z)' : OFFLINE_TITLE}>
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
