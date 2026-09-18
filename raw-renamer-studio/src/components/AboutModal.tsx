import { useSession } from '../store/useSession';
import { Logo } from './Logo';

/** BUG-007: пункт меню «О приложении» — рабочее окно (был тост-заглушка). */
export default function AboutModal() {
  const open = useSession((s) => s.modals.about);
  const closeModals = useSession((s) => s.closeModals);
  const info = useSession((s) => s.info);

  if (!open) return null;

  const row = 'flex items-center justify-between gap-3 px-4 py-2.5';
  const label = 'text-[12.5px] text-tx-3';
  const value = 'text-[12px] font-mono text-tx-1 truncate max-w-[320px]';

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[4px] flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModals();
      }}
    >
      <div className="w-[460px] max-w-[92vw] bg-[#1C1E26] border border-white/15 rounded-pop shadow-lift flex flex-col overflow-hidden">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
          <div className="w-11 h-11 rounded-xl grid place-items-center bg-surface border border-white/10">
            <Logo size={26} />
          </div>
          <div>
            <div className="text-[16px] font-bold leading-tight">RAW Renamer Studio</div>
            <div className="text-[11.5px] text-tx-3 mt-0.5">
              Каталогизация и пакетное переименование RAW-съёмки
            </div>
          </div>
          <button
            onClick={closeModals}
            className="ml-auto w-7 h-7 rounded-md grid place-items-center text-tx-3 hover:bg-elevated hover:text-tx-1"
          >
            ✕
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <section className="bg-panel rounded-lg border border-white/5">
            <div className={row}>
              <span className={label}>Версия</span>
              <span className={value}>v{info?.version ?? '0.1.0'}</span>
            </div>
            <div className={row}>
              <span className={label}>Sidecar</span>
              <span className={value}>
                {info ? `online · :${info.port}` : 'offline'}
              </span>
            </div>
            {info?.data_dir && (
              <div className={row}>
                <span className={label}>Каталог данных</span>
                <span className={value} title={info.data_dir}>
                  {info.data_dir}
                </span>
              </div>
            )}
            <div className={row}>
              <span className={label}>Стек</span>
              <span className={value}>Tauri 2 · React 18 · FastAPI</span>
            </div>
          </section>

          <p className="text-[11.5px] text-tx-3 leading-relaxed px-1">
            Рабочее место предметного фотографа: съёмка по заявке → распознавание
            штрихкодов (этикетки в кадре / имена файлов) → единообразные имена RAW
            → обратная запись ракурсов в Excel.
          </p>
        </div>

        <div className="px-5 py-3 flex items-center justify-end gap-3 border-t border-white/10">
          <button
            onClick={closeModals}
            className="h-9 px-5 rounded-lg bg-accent-fill hover:bg-[#6A57E2] text-white text-[12.5px] font-bold"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
