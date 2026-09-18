import { useEffect, useRef, useState } from 'react';
import { useSession } from '../store/useSession';
import * as sc from '../lib/sidecar';

function ean13Valid(s: string): boolean {
  if (!/^\d{13}$/.test(s)) return false;
  const sum = Array.from(s.slice(0, 12)).reduce(
    (a, c, i) => a + Number(c) * (i % 2 === 0 ? 1 : 3),
    0,
  );
  return (10 - (sum % 10)) % 10 === Number(s[12]);
}

export default function BarcodeModal() {
  const open = useSession((s) => s.modals.barcode);
  const session = useSession((s) => s.session);
  const activeId = useSession((s) => s.activeId);
  const closeModals = useSession((s) => s.closeModals);
  const applyBarcode = useSession((s) => s.applyBarcode);
  const toast = useSession((s) => s.toast);
  const [val, setVal] = useState('');
  const [look, setLook] = useState<{
    lm: string | null;
    name: string | null;
    source: string | null;
  } | null>(null);
  const timer = useRef<number | null>(null);

  const target =
    session?.items.find((i) => i.id === activeId && i.status === 'err') ??
    session?.items.find((i) => i.status === 'err') ??
    session?.items.find((i) => i.id === activeId) ??
    null;

  useEffect(() => {
    if (open) {
      setVal('');
      setLook(null);
    }
  }, [open]);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (val.length === 13) {
      timer.current = window.setTimeout(async () => {
        try {
          const r = await sc.rpc<{ lm: string | null; name: string | null; source: string | null }>(
            'lookup.find_sku',
            { barcode: val },
          );
          setLook(r);
        } catch {
          setLook(null);
        }
      }, 350);
    } else {
      setLook(null);
    }
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [val]);

  if (!open) return null;
  const valid = ean13Valid(val);

  const apply = (t: { id: string }) => {
    void applyBarcode(t.id, val);
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[4px] flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModals();
      }}
    >
      <div className="w-[460px] max-w-[calc(100vw-40px)] bg-[#1C1E26] border border-white/15 rounded-pop shadow-lift overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[16px] font-bold">Ввести штрихкод вручную</div>
            <div className="text-[12.5px] text-tx-3 mt-1">
              {target
                ? `Товар ${target.id.replace('it', '№')} · кадр без распознанного ШК`
                : 'Выберите товар'}
            </div>
          </div>
          <button
            onClick={closeModals}
            className="w-7 h-7 rounded-md grid place-items-center text-tx-3 hover:bg-elevated hover:text-tx-1"
          >
            ✕
          </button>
        </div>
        <div className="px-5 pb-2">
          <label className="block text-[12px] font-semibold text-tx-2 mb-1.5">
            Штрихкод (EAN-13)
          </label>
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value.replace(/\D/g, '').slice(0, 13))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid && target) apply(target);
            }}
            placeholder="4650101098817"
            spellCheck={false}
            className="w-full h-[46px] bg-input border-[1.5px] border-white/10 rounded-[9px] font-mono text-[20px] tracking-[0.18em] text-center text-tx-1 outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(124,108,240,0.16)]"
          />
          <div className="mt-2 min-h-[36px]">
            {val.length === 13 && !valid && (
              <div className="text-[12px] text-danger">Контрольная цифра неверна</div>
            )}
            {val.length === 13 && valid && look && (
              <div className="bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-[12.5px] flex items-center gap-2">
                <span className="text-ok">✓</span>
                <span className="text-tx-2">
                  {look.source === 'zayavka'
                    ? 'Есть в заявке'
                    : look.source === 'cache'
                      ? 'Из SQLite-кэша'
                      : look.source === 'api'
                        ? 'Найдено в APIM v3'
                        : 'В заявке и кэше нет — будет добавлен как новый'}
                </span>
                {look.lm && <span className="font-mono font-bold text-ok ml-auto">{look.lm}</span>}
              </div>
            )}
            {val.length > 0 && val.length < 13 && (
              <div className="text-[12px] text-tx-3">введено {val.length}/13 цифр</div>
            )}
          </div>
          <div className="text-[12px] text-tx-3 mt-1">
            Каскад: Заявка → SQLite-кэш → APIM v3 (master §8.3)
          </div>
        </div>
        <div className="px-5 py-3.5 flex justify-end gap-2.5 border-t border-white/5">
          <button
            onClick={closeModals}
            className="h-9 px-4 rounded-lg bg-surface border border-white/10 text-tx-1 text-[12.5px] font-semibold hover:bg-elevated"
          >
            Отмена
          </button>
          <button
            onClick={() => {
              if (!valid) {
                toast('err', 'Проверьте штрихкод', 'Нужно 13 цифр с корректной контрольной');
                return;
              }
              if (!target) {
                toast('warn', 'Нет товара для привязки', 'Выберите карточку «Требуют внимания»');
                return;
              }
              apply(target);
            }}
            className="h-9 px-4 rounded-lg bg-accent-fill hover:bg-[#6A57E2] text-white text-[12.5px] font-bold"
          >
            Найти в API и применить
          </button>
        </div>
      </div>
    </div>
  );
}
