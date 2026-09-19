import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  CalendarDays, FileSpreadsheet, FolderOpen, History,
  Undo2, Settings, Plus, PanelLeftClose, PanelLeftOpen, Loader2,
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

const OFFLINE_TITLE = 'Движок не отвечает — операция недоступна';

const MIN_SIDEBAR_WIDTH = 190;
const MAX_SIDEBAR_WIDTH = 420;
const DEFAULT_SIDEBAR_WIDTH = 248;

export default function Sidebar() {
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('rrs_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [width, setWidthState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('rrs_sidebar_width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= MIN_SIDEBAR_WIDTH && val <= MAX_SIDEBAR_WIDTH) {
          return val;
        }
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_SIDEBAR_WIDTH;
  });

  const [upload, setUpload] = useState<PickProgress | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLElement | null>(null);

  const session = useSession((s) => s.session);
  const online = useSession((s) => s.online);
  const busy = useSession((s) => s.busy);
  const undoLast = useSession((s) => s.undoLast);
  const setModal = useSession((s) => s.setModal);

  const setCollapsed = (val: boolean) => {
    setCollapsedState(val);
    try {
      localStorage.setItem('rrs_sidebar_collapsed', String(val));
    } catch {
      /* ignore */
    }
  };

  const setWidth = (val: number) => {
    const clamped = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, val));
    setWidthState(clamped);
    try {
      localStorage.setItem('rrs_sidebar_width', String(clamped));
    } catch {
      /* ignore */
    }
  };

  // Ресайзер перетаскиванием (drag)
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = moveEvent.clientX;
      setWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  const showJournal = async () => {
    await showJournalSummary();
  };

  const newBatch = () => {
    void pickFolder({
      onProgress: (p) => setUpload(p),
      onDone: () => setUpload(null),
    });
  };

  const folderName = session?.folder
    ? session.folder.split(/[\\/]/).filter(Boolean).pop() ?? ''
    : '';

  const offCls = !online ? 'opacity-40 cursor-not-allowed pointer-events-none' : '';

  // v3.6: свёрнутый вид — аккуратный док 52px с иконками быстрого доступа
  if (collapsed) {
    return (
      <aside className="w-[52px] flex-shrink-0 bg-panel border-r border-white/5 flex flex-col items-center py-2.5 select-none min-h-0">
        <button
          onClick={() => setCollapsed(false)}
          title="Развернуть боковую панель"
          aria-label="Развернуть боковую панель"
          className="w-8 h-8 rounded-lg grid place-items-center bg-elevated/70 text-tx-2 hover:bg-elevated hover:text-tx-1 transition-colors"
        >
          <PanelLeftOpen size={16} />
        </button>

        <div className="w-6 h-px bg-white/10 my-2.5" />

        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={newBatch}
            disabled={!online}
            title={online ? (session?.folder ? `Партия: ${folderName} (${session.items.length} товаров)` : 'Открыть папку…') : OFFLINE_TITLE}
            className={cx(
              'w-8 h-8 rounded-lg grid place-items-center transition-colors relative',
              session?.folder
                ? 'bg-accent-tint text-accent-text border border-accent/30 hover:bg-accent/25'
                : 'text-tx-3 hover:bg-surface-hover hover:text-tx-1',
              offCls,
            )}
          >
            <FolderOpen size={16} />
            {session?.folder && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent" />
            )}
          </button>

          <button
            onClick={() => setModal('zayavka', true)}
            title="Генератор заявки (PIM)"
            className="w-8 h-8 rounded-lg grid place-items-center text-tx-3 hover:bg-surface-hover hover:text-accent-text transition-colors"
          >
            <FileSpreadsheet size={16} />
          </button>

          <button
            onClick={showJournal}
            disabled={!online}
            title={online ? 'Журнал операций' : OFFLINE_TITLE}
            className={cx(
              'w-8 h-8 rounded-lg grid place-items-center text-tx-3 hover:bg-surface-hover hover:text-tx-1 transition-colors',
              offCls,
            )}
          >
            <History size={16} />
          </button>

          <button
            onClick={() => void undoLast()}
            disabled={!online}
            title={online ? 'Отменить последнее переименование (⌘Z)' : OFFLINE_TITLE}
            className={cx(
              'w-8 h-8 rounded-lg grid place-items-center text-tx-3 hover:bg-surface-hover hover:text-tx-1 transition-colors',
              offCls,
            )}
          >
            <Undo2 size={16} />
          </button>
        </div>

        <div className="mt-auto flex flex-col items-center">
          <button
            onClick={() => setModal('settings', true)}
            title="Настройки"
            className="w-8 h-8 rounded-lg grid place-items-center text-tx-3 hover:bg-surface-hover hover:text-tx-1 transition-colors"
          >
            <Settings size={16} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      ref={sidebarRef}
      style={{ width: `${width}px` }}
      className={cx(
        'relative flex-shrink-0 bg-panel border-r border-white/5 flex flex-col min-h-0 overflow-hidden',
        isResizing ? 'transition-none select-none' : 'transition-[width] duration-75',
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

      {/* Интерактивный разделитель (ручка изменения ширины) */}
      <div
        onMouseDown={startResizing}
        title="Перетащите для изменения ширины панели"
        className={cx(
          'absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize z-20 hover:bg-accent/60 transition-colors',
          isResizing && 'bg-accent w-1.5',
        )}
      />
    </aside>
  );
}
