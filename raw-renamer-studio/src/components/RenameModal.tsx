import { useSession } from '../store/useSession';

const KIND_LABEL = { label: 'Этикетка', main: 'Главный', angle: 'Ракурс' } as const;

export default function RenameModal() {
  const open = useSession((s) => s.modals.rename);
  const plan = useSession((s) => s.plan);
  const planSkipped = useSession((s) => s.planSkipped);
  const closeModals = useSession((s) => s.closeModals);
  const executePlan = useSession((s) => s.executePlan);
  const busy = useSession((s) => s.busy);
  const session = useSession((s) => s.session);

  if (!open || !plan) return null;
  const rows = plan.slice(0, 60);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[4px] flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModals();
      }}
    >
      <div className="w-[640px] max-w-[calc(100vw-40px)] max-h-[calc(100vh-60px)] bg-[#1C1E26] border border-white/15 rounded-pop shadow-lift flex flex-col overflow-hidden">
        <div className="px-5 pt-[18px] pb-3 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <div className="text-[16px] font-bold">Именование кадров</div>
            <div className="text-[12.5px] text-tx-3 mt-1">
              {plan.length} файлов · {new Set(plan.map((r) => r.item_id)).size} товаров
              {planSkipped ? ` · ${planSkipped} пропущено (нет кода LM)` : ''}
            </div>
          </div>
          <button
            onClick={closeModals}
            className="w-7 h-7 rounded-md grid place-items-center text-tx-3 hover:bg-elevated hover:text-tx-1"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-1 overflow-y-auto flex-1">
          <table className="w-full border-collapse font-mono text-[12px]">
            <thead>
              <tr className="text-left">
                <th className="text-[10px] tracking-[0.07em] uppercase text-tx-3 font-semibold py-1.5 px-2 border-b border-white/10 font-sans">
                  Было
                </th>
                <th className="text-[10px] tracking-[0.07em] uppercase text-tx-3 font-semibold py-1.5 px-2 border-b border-white/10 font-sans">
                  Станет
                </th>
                <th className="w-[110px] text-[10px] tracking-[0.07em] uppercase text-tx-3 font-semibold py-1.5 px-2 border-b border-white/10 font-sans">
                  Действие
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-surface">
                  <td className="py-[7px] px-2 border-b border-white/5 text-tx-3 line-through decoration-danger/60">
                    {r.src}
                  </td>
                  <td className="py-[7px] px-2 border-b border-white/5 text-ok font-semibold">{r.dst}</td>
                  <td className="py-[7px] px-2 border-b border-white/5 text-tx-2 font-sans text-[11.5px]">
                    {KIND_LABEL[r.kind]}
                  </td>
                </tr>
              ))}
              {plan.length > 60 && (
                <tr>
                  <td colSpan={3} className="py-2 px-2 text-tx-3">
                    … и ещё {plan.length - 60} файлов
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="bg-accent-tint border border-accent/25 rounded-lg px-3 py-2.5 text-[12.5px] text-tx-2 mt-3 flex gap-2.5">
            <span className="text-accent flex-shrink-0">ℹ</span>
            <span>
              После именования в Excel-отчёт запишутся ракурсы (колонка L, 12) и флаг
              этикетки (колонка M, 13).{' '}
              {session?.zayavka
                ? `Файл: ${session.zayavka.split(/[\\/]/).pop()}`
                : '⚠ Заявка не загружена — запись в Excel будет пропущена.'}{' '}
              Отмена — одной кнопкой ⌘Z.
            </span>
          </div>
        </div>
        <div className="px-5 py-3.5 flex justify-end gap-2.5 border-t border-white/5 flex-shrink-0">
          <button
            onClick={closeModals}
            className="h-9 px-4 rounded-lg bg-surface border border-white/10 text-tx-1 text-[12.5px] font-semibold hover:bg-elevated"
          >
            Назад
          </button>
          <button
            onClick={() => void executePlan()}
            disabled={busy}
            className="h-9 px-5 rounded-lg bg-accent-fill hover:bg-[#6A57E2] disabled:opacity-50 text-white text-[12.5px] font-bold"
          >
            {busy ? 'Переименование…' : `Переименовать ${plan.length} файлов`}
          </button>
        </div>
      </div>
    </div>
  );
}
