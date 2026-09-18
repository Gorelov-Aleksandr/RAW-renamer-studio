import { memo } from 'react';
import { Check, AlertTriangle, XCircle, Sparkles } from 'lucide-react';
import type { Item } from '../types';
import { useSession } from '../store/useSession';
import * as sc from '../lib/sidecar';
import { cx } from '../lib/cx';

function StatusChip({ item }: { item: Item }) {
  const base =
    'absolute top-2 left-2 inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-[3px] rounded-full border';
  if (item.status === 'err')
    return (
      <span className={cx(base, 'bg-[rgba(66,26,32,0.85)] text-[#F17177] border-danger/40')}>
        <XCircle size={11} />
        ШК не распознан
      </span>
    );
  if (item.status === 'warn')
    return (
      <span className={cx(base, 'bg-[rgba(58,44,20,0.85)] text-warn border-warn/30')}>
        <AlertTriangle size={11} />
        Без этикетки
      </span>
    );
  return (
    <span className={cx(base, 'bg-[rgba(32,54,44,0.82)] text-ok border-ok/30')}>
      <Check size={11} />
      Готово
    </span>
  );
}

export const ProductCard = memo(function ProductCard({ item }: { item: Item }) {
  const select = useSession((s) => s.select);
  const setActive = useSession((s) => s.setActive);
  const activeId = useSession((s) => s.activeId);
  const hero = item.frames.find((f) => !f.is_label) ?? item.frames[0];
  const clean = item.frames.filter((f) => !f.is_label).length;

  return (
    <div
      data-card={item.id}
      tabIndex={0}
      onClick={(e) => select(item.id, e.shiftKey || e.metaKey || e.ctrlKey)}
      onDoubleClick={() => setActive(item.id)}
      className={cx(
        'relative rounded-lg border bg-surface overflow-hidden outline-none transition-all duration-150 cursor-pointer',
        item.status === 'err' ? 'border-danger/60' : 'border-white/5 hover:bg-surface-hover',
        activeId === item.id &&
          'bg-surface-hover -translate-y-0.5 scale-[1.015] shadow-lift ring-1 ring-accent/40 z-10',
      )}
    >
      <div className="relative aspect-[4/3] bg-[#0F1015] border-b border-white/5">
        {hero?.preview ? (
          <img
            src={sc.previewUrl(hero.preview, 360)}
            alt=""
            loading="lazy"
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-tx-3/40">
            <AlertTriangle size={34} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
        <span className="absolute bottom-1.5 right-1.5 font-mono text-[9.5px] text-white/90 bg-black/50 px-1.5 py-0.5 rounded-md">
          {item.frames.length} кадр.
        </span>
        <StatusChip item={item} />
        {item.is_new && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-[3px] rounded-full bg-[rgba(26,40,60,0.85)] text-info border border-info/30">
            <Sparkles size={11} />
            Новый
          </span>
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="font-mono font-semibold text-[13.5px] tabular-nums truncate">
          {item.lm_code ?? 'нет артикула'}
        </div>
        <div className="font-mono text-[11px] text-tx-3 mt-0.5 tabular-nums truncate">
          {item.barcode ?? 'ШК не распознан · ввод: R'}
        </div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {item.has_label && (
            <span className="mono-tag !text-warm !border-warm/30 !bg-warm/10">_y</span>
          )}
          {clean > 0 && <span className="mono-tag">{clean} ракурс.</span>}
          {!item.barcode && <span className="mono-tag !text-tx-3">ввод ШК</span>}
        </div>
      </div>
    </div>
  );
});
