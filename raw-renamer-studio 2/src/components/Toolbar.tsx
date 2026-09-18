import { Search, Undo2 } from 'lucide-react';
import { useSession } from '../store/useSession';
import type { Filter } from '../store/useSession';
import { cx } from '../lib/cx';

const FILTERS: { f: Filter; label: string }[] = [
  { f: 'all', label: 'Все' },
  { f: 'ok', label: 'Готово' },
  { f: 'err', label: 'Требуют внимания' },
  { f: 'new', label: 'Новые' },
];

export default function Toolbar() {
  const session = useSession((s) => s.session);
  const online = useSession((s) => s.online);
  const filter = useSession((s) => s.filter);
  const search = useSession((s) => s.search);
  const zoom = useSession((s) => s.zoom);
  const setFilter = useSession((s) => s.setFilter);
  const setSearch = useSession((s) => s.setSearch);
  const setZoom = useSession((s) => s.setZoom);
  const undoLast = useSession((s) => s.undoLast);

  const items = session?.items ?? [];
  const count = (f: Filter): number => {
    if (f === 'all') return items.length;
    if (f === 'ok') return items.filter((i) => i.status === 'ok').length;
    if (f === 'err') return items.filter((i) => i.status !== 'ok').length;
    return items.filter((i) => i.is_new).length;
  };

  return (
    <div className="px-4 pt-3.5 pb-2.5 flex flex-wrap items-center gap-3 flex-shrink-0">
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(({ f, label }) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx(
              'inline-flex items-center gap-1.5 h-[29px] px-[11px] rounded-full text-xs font-semibold border transition-colors',
              filter === f
                ? 'bg-elevated text-tx-1 border-white/10'
                : 'bg-white/5 text-tx-2 border-white/10 hover:text-tx-1',
            )}
          >
            {label}
            <span
              className={cx(
                'font-mono text-[10.5px] font-semibold px-1.5 rounded-full bg-white/5',
                f === 'ok' && 'text-ok',
                f === 'err' && 'text-warn',
                f === 'new' && 'text-info',
              )}
            >
              {count(f)}
            </span>
          </button>
        ))}
      </div>
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ШК или артикул…"
          spellCheck={false}
          className="w-[250px] h-9 bg-input border border-white/10 rounded-lg pl-[34px] pr-3 font-mono text-[12.5px] text-tx-1 outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(124,108,240,0.16)]"
        />
      </div>
      <div className="flex-1" />
      <span className="hidden lg:inline-flex items-center gap-1.5 text-[11px] text-tx-3">
        Быстрый просмотр
        <kbd className="font-mono text-[10.5px] text-tx-2 bg-white/5 border border-white/10 border-b-2 rounded px-1.5">
          Space
        </kbd>
      </span>
      <button
        onClick={() => void undoLast()}
        disabled={!online}
        title={online ? 'Отмена последней операции (⌘Z)' : 'Движок не отвечает — отмена недоступна'}
        className={cx(
          'h-8 px-3 rounded-lg bg-input border border-white/10 text-[12.5px] font-semibold text-tx-2 hover:bg-elevated hover:text-tx-1 flex items-center gap-1.5',
          !online && 'opacity-40 cursor-not-allowed',
        )}
      >
        <Undo2 size={14} />
        Отменить
      </button>
      <div className="flex items-center gap-0.5 bg-input border border-white/10 rounded-lg p-0.5">
        <button
          onClick={() => setZoom(zoom - 10)}
          className="w-[27px] h-[27px] rounded-md grid place-items-center text-tx-2 hover:bg-elevated"
          title="Мельче (−)"
        >
          −
        </button>
        <span className="font-mono text-[11px] text-tx-3 w-[34px] text-center">{zoom}%</span>
        <button
          onClick={() => setZoom(zoom + 10)}
          className="w-[27px] h-[27px] rounded-md grid place-items-center text-tx-2 hover:bg-elevated"
          title="Крупнее (+)"
        >
          +
        </button>
      </div>
    </div>
  );
}
