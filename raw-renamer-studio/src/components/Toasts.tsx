import { CheckCircle2, AlertTriangle, XCircle, Info, Undo2 } from 'lucide-react';
import { useSession } from '../store/useSession';
import { cx } from '../lib/cx';

const ICONS = { ok: CheckCircle2, warn: AlertTriangle, err: XCircle, info: Info, undo: Undo2 } as const;
const COLORS = {
  ok: 'text-ok',
  warn: 'text-warn',
  err: 'text-danger',
  info: 'text-accent-text',
  undo: 'text-warm',
} as const;

export default function Toasts() {
  const toasts = useSession((s) => s.toasts);
  const drop = useSession((s) => s.dropToast);

  return (
    <div className="fixed top-12 right-4 z-[80] flex flex-col gap-2 w-[350px] max-w-[calc(100vw-32px)]">
      {toasts.map((t) => {
        const Ic = ICONS[t.kind];
        return (
          <div
            key={t.id}
            className="bg-[rgba(28,29,38,0.82)] backdrop-blur-xl border border-white/10 rounded-xl shadow-lift px-3.5 py-3 flex gap-2.5 items-start"
          >
            <Ic size={16} className={cx('flex-shrink-0 mt-px', COLORS[t.kind])} />
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-tx-1">{t.title}</div>
              {t.sub && (
                <div className="text-[11.5px] text-tx-3 mt-1 leading-snug break-words">{t.sub}</div>
              )}
            </div>
            {t.actionLabel && (
              <button
                onClick={() => {
                  drop(t.id);
                  t.action?.();
                }}
                className="ml-auto flex-shrink-0 text-[11.5px] font-bold text-accent-text hover:underline px-1"
              >
                {t.actionLabel}
              </button>
            )}
            <button
              onClick={() => drop(t.id)}
              className={cx('text-tx-3 hover:text-tx-1 text-xs', !t.actionLabel && 'ml-auto')}
              title="Скрыть"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
