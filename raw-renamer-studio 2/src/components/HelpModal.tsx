import { CircleHelp } from 'lucide-react';
import { useSession } from '../store/useSession';

const STEPS: [string, string][] = [
  ['1', 'Выберите папку съёмки — «Открыть папку…» или «+» в блоке Сессии.'],
  ['2', 'Подключите заявку: «Генератор заявки» → открыть .xlsx или сгенерировать из выгрузки PIM (CSV).'],
  ['3', 'Сверьте товары: ШК с фото (CV-сканер) или из имён файлов; ошибки — вручную (R).'],
  ['4', 'Постройте план переименования и выполните его. Ракурсы в Excel (L/M) обновятся автоматически.'],
  ['5', 'Перепутали? Откат — «Откат (Undo)» или ⌘Z: имена и Excel вернутся к прежнему виду.'],
];

const KEYS: [string, string][] = [
  ['⌘Z / Ctrl+Z', 'Отменить последнее переименование'],
  ['⌘K / Ctrl+K', 'Командная палитра — быстрый поиск действий'],
  ['R', 'Ввести ШК вручную (товар с ошибкой)'],
  ['Space', 'Быстрый просмотр кадра (лайтбокс)'],
  ['Esc', 'Закрыть окно / снять выбор'],
];

/** BUG-007: пункт меню «Справка» — рабочая справка (был тост-заглушка). */
export default function HelpModal() {
  const open = useSession((s) => s.modals.help);
  const closeModals = useSession((s) => s.closeModals);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[4px] flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModals();
      }}
    >
      <div className="w-[620px] max-w-[92vw] max-h-[88vh] bg-[#1C1E26] border border-white/15 rounded-pop shadow-lift flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="text-[16px] font-bold flex items-center gap-2">
            <CircleHelp size={18} className="text-accent-text" />
            Справка
          </div>
          <button
            onClick={closeModals}
            className="w-7 h-7 rounded-md grid place-items-center text-tx-3 hover:bg-elevated hover:text-tx-1"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex flex-col gap-4 flex-1">
          <section className="bg-panel rounded-lg border border-white/5">
            <div className="px-4 py-2 border-b border-white/5 text-[11px] font-bold tracking-wide text-tx-3 uppercase">
              Как работать
            </div>
            <ol className="px-4 py-3 flex flex-col gap-2">
              {STEPS.map(([n, txt]) => (
                <li key={n} className="flex gap-2.5 text-[12.5px] text-tx-2 leading-snug">
                  <span className="w-[18px] h-[18px] flex-shrink-0 rounded-full bg-accent-tint text-accent-text text-[10.5px] font-bold grid place-items-center font-mono mt-px">
                    {n}
                  </span>
                  <span>{txt}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="bg-panel rounded-lg border border-white/5">
            <div className="px-4 py-2 border-b border-white/5 text-[11px] font-bold tracking-wide text-tx-3 uppercase">
              Горячие клавиши
            </div>
            <div className="px-4 py-2.5 flex flex-col gap-1.5 text-[11.5px]">
              {KEYS.map(([k, d]) => (
                <div key={k} className="flex items-center gap-3">
                  <kbd className="font-mono text-[10.5px] text-tx-2 bg-white/5 border border-white/10 border-b-2 rounded px-1.5 h-[22px] inline-flex items-center justify-center w-[120px] flex-shrink-0">
                    {k}
                  </kbd>
                  <span className="text-tx-2">{d}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-panel rounded-lg border border-white/5">
            <div className="px-4 py-2 border-b border-white/5 text-[11px] font-bold tracking-wide text-tx-3 uppercase">
              Важно
            </div>
            <ul className="px-4 py-3 flex flex-col gap-1.5 text-[12px] text-tx-2 list-disc pl-9 marker:text-tx-3">
              <li>Именование: <span className="font-mono">код.CR2</span> (основной, без суффикса), <span className="font-mono">код_01.CR2…</span> (ракурсы), <span className="font-mono">код_y.CR2</span> (кадр с этикеткой).</li>
              <li>Кастомные суффиксы: <span className="font-mono">_com</span>, <span className="font-mono">_pack</span>, <span className="font-mono">_ins</span>, <span className="font-mono">_tag</span>.</li>
              <li>Excel открыт в Microsoft Excel — запись L/M блокируется; после закрытия файла нажмите «Повторить» в тосте.</li>
              <li>Индикатор в шапке: «запуск…» — Python-движок стартует (3–10 с, это нормально); «онлайн» — работает; «движок не отвечает» — операции блокируются, перезапустите приложение.</li>
            </ul>
          </section>
        </div>

        <div className="px-5 py-3 flex items-center justify-between gap-3 border-t border-white/10 flex-shrink-0">
          <div className="text-[11px] text-tx-3">RAW Renamer Studio · справка</div>
          <button
            onClick={closeModals}
            className="h-9 px-5 rounded-lg bg-accent-fill hover:bg-[#6A57E2] text-white text-[12.5px] font-bold"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
