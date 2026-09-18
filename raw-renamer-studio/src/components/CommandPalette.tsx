import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileSpreadsheet,
  FolderOpen,
  History,
  Info,
  RefreshCw,
  Search,
  Settings,
  ArrowLeftRight,
  Undo2,
  CircleHelp,
} from 'lucide-react';
import { useSession } from '../store/useSession';
import { pickFolder } from '../lib/pickFolder';
import { showJournalSummary } from '../lib/ops';
import { cx } from '../lib/cx';

interface Action {
  id: string;
  label: string;
  hint?: string;
  keywords: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  run: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * BUG-008: командная палитра (⌘K / Ctrl+K) — настоящее окно с полем ввода
 * и списком действий (был тост-заглушка).
 */
export default function CommandPalette() {
  const open = useSession((s) => s.modals.palette);
  const closeModals = useSession((s) => s.closeModals);
  const online = useSession((s) => s.online);
  const session = useSession((s) => s.session);
  const setModal = useSession((s) => s.setModal);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const actions: Action[] = useMemo(() => {
    const st = useSession.getState();
    return [
      {
        id: 'open-folder',
        label: 'Открыть папку с RAW-файлами',
        hint: 'Новая партия',
        keywords: 'открыть папку raw новая партия сессия folder',
        icon: FolderOpen,
        run: () => void pickFolder(),
        disabled: !online,
        disabledReason: 'sidecar офлайн',
      },
      {
        id: 'zayavka',
        label: 'Заявка на съёмку: открыть / сгенерировать из PIM',
        hint: 'Генератор',
        keywords: 'заявка пим csv xlsx генератор openpyxl',
        icon: FileSpreadsheet,
        run: () => setModal('zayavka', true),
      },
      {
        id: 'refresh-angles',
        label: 'Обновить ракурсы в заявке (L/M) по фактическим файлам',
        keywords: 'ракурсы обновить excel l m angle refresh',
        icon: RefreshCw,
        run: () => void st.refreshAngles(),
        disabled: !session?.zayavka || !online,
        disabledReason: session?.zayavka ? 'sidecar офлайн' : 'заявка не подключена',
      },
      {
        id: 'undo',
        label: 'Отменить последнее переименование',
        hint: '⌘Z',
        keywords: 'откат отменить undo вернуть',
        icon: Undo2,
        run: () => void st.undoLast(),
        disabled: !online,
        disabledReason: 'sidecar офлайн',
      },
      {
        id: 'journal',
        label: 'Журнал операций: сводка',
        keywords: 'журнал операции undo история journal',
        icon: History,
        run: () => void showJournalSummary(),
        disabled: !online,
        disabledReason: 'sidecar офлайн',
      },
      {
        id: 'flip-mode',
        label: `Переключить режим партии: ${session?.mode === 'cv' ? 'CV-сканер → По именам' : 'По именам → CV-сканер'}`,
        keywords: 'режим режим cv сканер имена mode переключить',
        icon: ArrowLeftRight,
        run: () => st.flipMode(),
        disabled: !session?.folder,
        disabledReason: 'партия не открыта',
      },
      {
        id: 'settings',
        label: 'Настройки',
        keywords: 'настройки настройки апим журнал sidecar settings',
        icon: Settings,
        run: () => setModal('settings', true),
      },
      {
        id: 'help',
        label: 'Справка',
        keywords: 'справка помощь hotkeys клавиши help',
        icon: CircleHelp,
        run: () => setModal('help', true),
      },
      {
        id: 'about',
        label: 'О приложении',
        keywords: 'о приложении версия about',
        icon: Info,
        run: () => setModal('about', true),
      },
    ];
  }, [online, session, setModal]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) =>
      (a.label + ' ' + a.keywords + ' ' + (a.hint ?? '')).toLowerCase().includes(q),
    );
  }, [actions, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSel(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSel(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  const runAction = (a: Action) => {
    if (a.disabled) return;
    closeModals();
    a.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const a = filtered[sel];
      if (a) runAction(a);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeModals();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-[4px] flex items-start justify-center pt-[14vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModals();
      }}
    >
      <div className="w-[560px] max-w-[92vw] bg-[#1C1E26] border border-white/15 rounded-pop shadow-lift flex flex-col overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/10">
          <Search size={16} className="text-tx-3 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Поиск действий… (папка, заявка, откат, настройки)"
            spellCheck={false}
            className="flex-1 bg-transparent outline-none text-[13.5px] text-tx-1 placeholder:text-tx-3"
          />
          <kbd className="text-[10px] font-mono text-tx-3 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 flex-shrink-0">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[340px] overflow-y-auto py-1.5 flex flex-col">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-[12.5px] text-tx-3">
              Ничего не найдено по «{query}»
            </div>
          )}
          {filtered.map((a, i) => {
            const Ic = a.icon;
            const active = i === sel;
            return (
              <button
                key={a.id}
                data-idx={i}
                disabled={a.disabled}
                onClick={() => runAction(a)}
                onMouseEnter={() => setSel(i)}
                title={a.disabled ? a.disabledReason : undefined}
                className={cx(
                  'flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors',
                  active && !a.disabled && 'bg-surface-hover',
                  a.disabled && 'opacity-40 cursor-not-allowed',
                )}
              >
                <Ic size={16} className={cx('flex-shrink-0', active ? 'text-accent-text' : 'text-tx-3')} />
                <span className="text-[13px] text-tx-1 truncate">{a.label}</span>
                <span className="ml-auto flex-shrink-0 flex items-center gap-2">
                  {a.disabled && (
                    <span className="text-[10px] text-tx-3 italic">{a.disabledReason}</span>
                  )}
                  {a.hint && !a.disabled && (
                    <kbd className="font-mono text-[10px] text-tx-3 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                      {a.hint}
                    </kbd>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-2 border-t border-white/10 flex items-center gap-3 text-[10.5px] text-tx-3 flex-shrink-0">
          <span className="inline-flex items-center gap-1">
            <kbd className="font-mono bg-white/5 border border-white/10 rounded px-1">↑↓</kbd> навигация
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="font-mono bg-white/5 border border-white/10 rounded px-1">Enter</kbd> выполнить
          </span>
          <span className="ml-auto">⌘K — закрыть/открыть</span>
        </div>
      </div>
    </div>
  );
}
