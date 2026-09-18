import { RefreshCw, PenSquare } from 'lucide-react';
import { useSession } from '../store/useSession';
import { cx } from '../lib/cx';

function Stat({
  n, label, cls, onClick,
}: {
  n: number;
  label: string;
  cls: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`Показать только: ${label}`}
      className="flex items-center gap-1.5 px-2 py-[3px] rounded-md hover:bg-white/5"
    >
      <span className={cx('font-mono font-bold', cls)}>{n}</span>
      <span className="text-[11.5px] text-tx-3">{label}</span>
    </button>
  );
}

export default function StatusBar() {
  const session = useSession((s) => s.session);
  const zoom = useSession((s) => s.zoom);
  const info = useSession((s) => s.info);
  const makePlan = useSession((s) => s.makePlan);
  const busy = useSession((s) => s.busy);
  const lastExcelTs = useSession((s) => s.lastExcelTs);
  const toast = useSession((s) => s.toast);

  const items = session?.items ?? [];
  const ok = items.filter((i) => i.status === 'ok').length;
  const at = items.filter((i) => i.status !== 'ok').length;
  const nw = items.filter((i) => i.is_new).length;
  const frames = items.reduce((a, i) => a + i.frames.length, 0);
  const fresh = Date.now() - lastExcelTs < 8000;
  const engines = info?.engines;

  return (
    <footer className="h-10 flex-shrink-0 flex items-center gap-3 px-3.5 bg-panel border-t border-white/5 text-[12px] text-tx-2">
      <Stat n={ok} label="готово" cls="text-ok" onClick={() => useSession.getState().setFilter(ok ? 'ok' : 'all')} />
      <Stat n={at} label="требуют внимания" cls="text-warn" onClick={() => useSession.getState().setFilter(at ? 'err' : 'all')} />
      <Stat n={nw} label="новых" cls="text-info" onClick={() => useSession.getState().setFilter(nw ? 'new' : 'all')} />
      <span className="flex items-center gap-1.5 px-2 py-[3px] rounded-md">
        <span className="font-mono font-bold text-tx-1">{frames}</span>
        <span className="text-[11.5px] text-tx-3">кадров</span>
      </span>
      <span className="text-[11.5px] text-tx-3 hidden md:inline">сетка · {zoom}%</span>
      <span className="flex items-center gap-1.5 ml-auto">
        <span
          className={cx(
            'w-[7px] h-[7px] rounded-full',
            engines ? (engines.zxing || engines.opencv ? 'bg-ok' : 'bg-warn') : 'bg-danger',
          )}
        />
        {engines ? (
          <span className="text-[11.5px] text-tx-3">
            {engines.zxing || engines.opencv ? 'распознавание ШК активно' : 'распознавание ШК не настроено — см. «Настройки»'}
          </span>
        ) : (
          <span className="text-[11.5px] text-tx-3">движок не отвечает</span>
        )}
      </span>
      <button
        onClick={() =>
          toast(
            'info',
            'Excel-отчёт',
            session?.zayavka
              ? session.zayavka
              : 'Заявка не загружена — обратная запись L/M будет пропущена',
          )
        }
        className={cx(
          'h-7 px-2.5 rounded-lg border text-[12px] font-semibold flex items-center gap-1.5',
          fresh
            ? 'text-accent-text border-accent/35 bg-accent-tint'
            : 'bg-surface border-white/5 text-tx-2 hover:bg-elevated hover:text-tx-1',
        )}
      >
        <RefreshCw size={13} />
        Excel
        {fresh && <span className="w-1.5 h-1.5 rounded-full bg-warm shadow-[0_0_6px_#F0A24E]" />}
      </button>
      <button
        onClick={() => void makePlan()}
        disabled={busy || !items.length}
        className="h-9 px-4 rounded-lg bg-accent-fill hover:bg-[#6A57E2] disabled:opacity-50 text-white text-[12.5px] font-bold flex items-center gap-2 shadow-[0_2px_10px_rgba(110,92,231,0.35)]"
      >
        <PenSquare size={15} />
        Переименовать всё
      </button>
    </footer>
  );
}
