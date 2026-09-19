import { useState, useCallback, useRef } from 'react';
import { CSS } from '@dnd-kit/utilities';
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { X, ZoomIn, Pencil, Tag } from 'lucide-react';
import type { Frame, Item } from '../types';
import { useSession } from '../store/useSession';
import * as sc from '../lib/sidecar';
import { cx } from '../lib/cx';

const MIN_RIGHT_WIDTH = 260;
const MAX_RIGHT_WIDTH = 540;
const DEFAULT_RIGHT_WIDTH = 320;

function rankInClean(item: Item, idx: number): number {
  let rank = 0;
  for (let k = 0; k < item.frames.length; k++) {
    if (k === idx) return item.frames[idx].is_label ? -1 : rank;
    if (!item.frames[k].is_label) rank++;
  }
  return -1;
}

function SortableFrame({
  item, f, i, onSuffix, onToggleLabel, onOpen,
}: {
  item: Item;
  f: Frame;
  i: number;
  onSuffix: (s: string | null) => void;
  onToggleLabel: () => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: f.name });
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState('');
  const rank = rankInClean(item, i);
  const isMain = rank === 0;
  const badge = f.is_label
    ? '_y'
    : isMain
      ? '—'
      : f.suffix_custom || `_${String(rank).padStart(2, '0')}`;

  const commit = () => {
    onSuffix(val.trim() || null);
    setEdit(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...listeners}
      {...attributes}
      className={cx(
        'shrink-0 w-[78px] rounded-md border p-1 bg-surface cursor-grab active:cursor-grabbing touch-none relative group',
        isDragging ? 'opacity-70 ring-1 ring-accent/50 border-accent/40 z-10' : 'border-white/10',
      )}
    >
      <div className="relative block w-full h-[54px] rounded bg-[#0F1015] overflow-hidden">
        <button
          onClick={onOpen}
          title={`${f.name} — клик для полноэкранного просмотра`}
          className="w-full h-full block"
        >
          {f.preview && (
            <img
              src={sc.previewUrl(f.preview, 120)}
              alt=""
              draggable={false}
              className="w-full h-full object-cover"
            />
          )}
        </button>

        {/* Бейдж / кнопка этикетки _y */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLabel();
          }}
          title={f.is_label ? 'Кадр этикетки (_y). Кликните, чтобы снять' : 'Сделать этот кадр этикеткой (_y)'}
          className={cx(
            'absolute bottom-0.5 right-0.5 text-[8.5px] font-mono px-1 py-0.5 rounded transition-all',
            f.is_label
              ? 'bg-amber-500/90 text-black font-bold shadow'
              : 'opacity-0 group-hover:opacity-100 bg-black/75 text-tx-2 hover:text-white hover:bg-black',
          )}
        >
          {f.is_label ? 'y' : '+y'}
        </button>
      </div>

      {edit ? (
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEdit(false);
          }}
          onClick={(e) => e.stopPropagation()}
          maxLength={6}
          placeholder="_06 / _y"
          className="w-full mt-1 bg-base border border-accent rounded px-1 py-0.5 font-mono text-[10px] text-center outline-none"
        />
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setVal(f.suffix_custom ?? (f.is_label ? '_y' : ''));
            setEdit(true);
          }}
          title={
            f.is_label
              ? 'Кадр этикетки: суффикс _y. Кликните для редактирования'
              : isMain
                ? 'Главный ракурс: строго без суффикса. Клик — кастомный суффикс'
                : 'Клик — кастомный суффикс: _06, _y, _com, _pack, _ins, _tag'
          }
          className={cx(
            'w-full mt-1 font-mono text-[10px] rounded px-1 py-0.5 tabular-nums transition-colors',
            f.is_label
              ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 font-bold'
              : isMain
                ? 'text-tx-3 bg-white/5 hover:bg-white/10'
                : 'text-tx-2 bg-white/5 hover:bg-white/10',
          )}
        >
          {badge}
        </button>
      )}
    </div>
  );
}

function srcLabel(s: string): string {
  if (s === 'manual') return 'ввод вручную';
  if (s === 'orphan') return '—';
  if (s.startsWith('cv:')) return `с фото (${s.slice(3)})`;
  if (s === 'names') return 'по имени файла';
  if (s === 'marker') return 'маркер камеры';
  return s;
}

export default function RightPanel() {
  const [width, setWidthState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('rrs_right_panel_width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= MIN_RIGHT_WIDTH && val <= MAX_RIGHT_WIDTH) {
          return val;
        }
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_RIGHT_WIDTH;
  });

  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  const setWidth = (val: number) => {
    const clamped = Math.max(MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, val));
    setWidthState(clamped);
    try {
      localStorage.setItem('rrs_right_panel_width', String(clamped));
    } catch {
      /* ignore */
    }
  };

  // Ресайзер перетаскиванием (drag) слева
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = window.innerWidth - moveEvent.clientX;
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

  const session = useSession((s) => s.session);
  const activeId = useSession((s) => s.activeId);
  const setActive = useSession((s) => s.setActive);
  const setModal = useSession((s) => s.setModal);
  const makePlan = useSession((s) => s.makePlan);
  const moveFrame = useSession((s) => s.moveFrame);
  const setSuffix = useSession((s) => s.setSuffix);
  const toggleLabel = useSession((s) => s.toggleLabel);
  const setLightbox = useSession((s) => s.setLightbox);
  const busy = useSession((s) => s.busy);
  const item = session?.items.find((i) => i.id === activeId) ?? null;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!item || !over) return;
    const from = item.frames.findIndex((f) => f.name === active.id);
    const to = item.frames.findIndex((f) => f.name === over.id);
    if (from >= 0 && to >= 0 && from !== to) void moveFrame(item.id, from, to);
  };

  if (!item) {
    return (
      <aside
        ref={panelRef}
        style={{ width: `${width}px` }}
        className={cx(
          'relative flex-shrink-0 bg-panel border-l border-white/5 flex flex-col min-h-0',
          isResizing ? 'transition-none select-none' : 'transition-[width] duration-75',
        )}
      >
        {/* Интерактивный разделитель слева */}
        <div
          onMouseDown={startResizing}
          title="Перетащите для изменения ширины панели"
          className={cx(
            'absolute top-0 left-0 bottom-0 w-1.5 cursor-col-resize z-20 hover:bg-accent/60 transition-colors',
            isResizing && 'bg-accent w-1.5',
          )}
        />
        <div className="px-4 pt-4 pb-2 text-[11px] font-semibold tracking-[0.08em] uppercase text-tx-3">
          Товар
        </div>
        <div className="flex-1 grid place-items-center text-tx-3 text-[12.5px] px-6 text-center leading-relaxed">
          Выберите карточку товара, чтобы увидеть кадры и управлять ракурсами
        </div>
      </aside>
    );
  }

  const hero = item.frames.find((f) => !f.is_label) ?? item.frames[0];
  const clean = item.frames.filter((f) => !f.is_label).length;
  const statusRow: [string, string][] = [
    ['Ракурсов', String(clean)],
    ['Этикетка _y', item.has_label ? 'есть' : 'нет'],
    ['Excel', item.is_new ? 'дописать строку' : item.excel_row ? `строка ${item.excel_row}` : '—'],
    ['Источник', srcLabel(item.source)],
  ];

  return (
    <aside
      ref={panelRef}
      style={{ width: `${width}px` }}
      className={cx(
        'relative flex-shrink-0 bg-panel border-l border-white/5 flex flex-col min-h-0',
        isResizing ? 'transition-none select-none' : 'transition-[width] duration-75',
      )}
    >
      {/* Интерактивный разделитель слева */}
      <div
        onMouseDown={startResizing}
        title="Перетащите для изменения ширины панели"
        className={cx(
          'absolute top-0 left-0 bottom-0 w-1.5 cursor-col-resize z-20 hover:bg-accent/60 transition-colors',
          isResizing && 'bg-accent w-1.5',
        )}
      />

      <div className="flex items-center px-4 pt-4 pb-2">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-tx-3">Товар</span>
        <div className="flex-1" />
        <button
          onClick={() => setActive(null)}
          className="w-7 h-7 rounded-md grid place-items-center text-tx-3 hover:bg-elevated hover:text-tx-1"
          title="Закрыть панель"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="relative aspect-[4/3] rounded-[10px] overflow-hidden border border-white/10 bg-[#0F1015] mb-3 shadow-card">
          {hero?.preview && (
            <img
              src={sc.previewUrl(hero.preview, 640)}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {hero?.preview && (
            <button
              onClick={() =>
                setLightbox({
                  src: sc.previewUrl(hero.preview, 1400),
                  cap: `${item.lm_code ?? '—'} · ${hero.name}`,
                })
              }
              className="absolute top-1.5 right-1.5 w-[26px] h-[26px] rounded-md bg-black/55 grid place-items-center text-white hover:bg-black/75"
              title="Увеличить"
            >
              <ZoomIn size={14} />
            </button>
          )}
          <span className="absolute bottom-1.5 right-1.5 font-mono text-[10px] text-white/85 bg-black/55 px-1.5 py-0.5 rounded">
            {item.frames.length} кадр.
          </span>
        </div>
        <div className="font-mono font-semibold text-[14px] tabular-nums">
          {item.lm_code ?? 'не распознан'}
        </div>
        <div className="font-mono text-[12px] text-tx-3 mt-0.5 tabular-nums">
          {item.barcode ?? 'ШК не распознан'} · {item.is_new ? 'новый (вне заявки)' : 'LM Code'}
        </div>
        {item.product_name && (
          <div className="text-[12px] text-tx-2 mt-1.5 leading-snug">{item.product_name}</div>
        )}
        <div className="mt-3">
          {statusRow.map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between items-center py-2 border-b border-white/5 text-[12.5px] last:border-0"
            >
              <span className="text-tx-3">{k}</span>
              <span className="font-mono font-semibold flex items-center gap-1.5">
                {v}
                {k === 'Этикетка _y' &&
                  (item.has_label ? (
                    <span className="text-[10.5px] font-bold px-1.5 py-px rounded-full bg-ok/15 text-ok">
                      есть
                    </span>
                  ) : (
                    <span className="text-[10.5px] font-bold px-1.5 py-px rounded-full bg-warn/15 text-warn">
                      нет
                    </span>
                  ))}
                {k === 'Excel' && item.is_new && (
                  <span className="text-[10.5px] font-bold px-1.5 py-px rounded-full bg-info/15 text-info">
                    новый
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4 mb-2">
          <div className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-tx-3">
            Кадры · перетащите для порядка
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={item.frames.map((f) => f.name)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex gap-1.5 overflow-x-auto pb-1.5">
              {item.frames.map((f, i) => (
                <SortableFrame
                  key={f.name}
                  item={item}
                  f={f}
                  i={i}
                  onSuffix={(suf) => void setSuffix(item.id, i, suf)}
                  onToggleLabel={() => void toggleLabel(item.id, i)}
                  onOpen={() =>
                    f.preview &&
                    setLightbox({
                      src: sc.previewUrl(f.preview, 1400),
                      cap: `${item.lm_code ?? '—'} · ${f.name}`,
                    })
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="text-[10px] text-tx-3 mt-1 leading-relaxed">
          Порядок: этикетка → <span className="font-mono text-amber-400">_y</span> (клик на <span className="font-mono">y</span> на кадре), главный ракурс — без
          суффикса, далее <span className="font-mono">_01, _02…</span>. Клик по номеру —
          кастомный суффикс.
        </div>

        <div className="flex flex-col gap-2 mt-4">
          {item.status === 'err' ? (
            <button
              onClick={() => setModal('barcode', true)}
              className="h-9 rounded-lg bg-accent-fill hover:bg-[#6A57E2] text-white text-[12.5px] font-semibold flex items-center justify-center gap-2"
            >
              Ввести штрихкод вручную…
            </button>
          ) : (
            <button
              onClick={() => void makePlan([item.id])}
              disabled={busy}
              className="h-9 rounded-lg bg-accent-fill hover:bg-[#6A57E2] disabled:opacity-50 text-white text-[12.5px] font-semibold flex items-center justify-center gap-2"
            >
              <Pencil size={14} />
              Переименовать этот товар
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
