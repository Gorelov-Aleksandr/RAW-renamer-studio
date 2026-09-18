import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FolderOpen } from 'lucide-react';
import { useSession } from '../store/useSession';
import { ProductCard } from './ProductCard';
import { pickFolder } from '../lib/pickFolder';
import { Logo } from './Logo';

/**
 * Виртуализированная сетка товаров (@tanstack/react-virtual, master §7):
 * 2000+ карточек без лагов. Скролл только по вертикали; высота ряда
 * измеряется (measureElement).
 */
export default function VirtualGrid() {
  const session = useSession((s) => s.session);
  const filter = useSession((s) => s.filter);
  const search = useSession((s) => s.search);
  const setSearch = useSession((s) => s.setSearch);
  const zoom = useSession((s) => s.zoom);
  const parentRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 32));
    ro.observe(el);
    setWidth(el.clientWidth - 32);
    return () => ro.disconnect();
  }, [session]);

  const items = useMemo(() => {
    let arr = session?.items ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      // v3.5: поиск по ВСЕМ артикулам — код LM, ШК или название товара
      // (каждое поле независимо — без «склеивания» значений между полями).
      arr = arr.filter((it) =>
        `${it.lm_code ?? ''}`.toLowerCase().includes(q) ||
        `${it.barcode ?? ''}`.toLowerCase().includes(q) ||
        `${it.product_name ?? ''}`.toLowerCase().includes(q),
      );
    }
    if (filter === 'ok') arr = arr.filter((it) => it.status === 'ok');
    else if (filter === 'err') arr = arr.filter((it) => it.status !== 'ok');
    else if (filter === 'new') arr = arr.filter((it) => it.is_new);
    return arr;
  }, [session, filter, search]);

  const gap = 14;
  const minCard = Math.max(150, Math.round((210 * zoom) / 100));
  const cols = Math.max(1, Math.floor((width + gap) / (minCard + gap)));
  const cardW = (width - (cols - 1) * gap) / cols;
  const rowH = Math.round(cardW * 0.75 + 94);
  const rows = Math.ceil(items.length / cols);

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowH,
    overscan: 6,
  });

  if (!session) {
    return (
      <div className="flex-1 grid place-items-center p-8">
        <div className="max-w-md w-full bg-surface border border-white/10 rounded-xl p-7 text-center">
          <div className="flex justify-center mb-4">
            <Logo size={44} />
          </div>
          <h2 className="font-semibold text-[17px]">Партия не открыта</h2>
          <p className="text-tx-3 text-[12.5px] mt-2 leading-relaxed">
            Загрузите папку с RAW-файлами съёмки — приложение распознает штрихкоды на
            встроенных превью, сгруппирует кадры в товары и подготовит план именования
            с записью в Excel-отчёт.
          </p>
          <div className="flex flex-col gap-2 mt-5">
            <button
              onClick={() => void pickFolder()}
              className="h-9 rounded-lg bg-surface-hover border border-white/10 text-tx-1 text-[12.5px] font-semibold flex items-center justify-center gap-2 hover:bg-elevated"
            >
              <FolderOpen size={15} />
              Открыть папку…
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto min-h-0">
      <div ref={innerRef} className="px-4 py-2 w-full">
        {items.length === 0 ? (
          <div className="grid place-items-center h-40 text-center">
            <div>
              <div className="text-tx-3 text-[13px]">
                Ничего не найдено{search.trim() ? <> по запросу «<span className="text-tx-2">{search.trim()}</span>»</> : ' по фильтру'}
              </div>
              {search.trim() && (
                <button
                  onClick={() => setSearch('')}
                  className="mt-2 h-8 px-3 rounded-md bg-surface-hover border border-white/10 text-tx-1 text-[12px] font-semibold hover:bg-elevated"
                >
                  Сбросить поиск
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const start = vi.index * cols;
              const slice = items.slice(start, start + cols);
              return (
                <div
                  key={vi.key}
                  ref={(el) => {
                    if (el) virtualizer.measureElement(el);
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap }}
                  >
                    {slice.map((it) => (
                      <ProductCard key={it.id} item={it} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
