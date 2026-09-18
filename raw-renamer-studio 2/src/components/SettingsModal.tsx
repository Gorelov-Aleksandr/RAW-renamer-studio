import { useEffect, useState } from 'react';
import { Settings, Trash2 } from 'lucide-react';
import { useSession, errMsg } from '../store/useSession';
import * as sc from '../lib/sidecar';

/** v3.1: полноценное окно настроек (вместо информационного тоста). */
export default function SettingsModal() {
  const open = useSession((s) => s.modals.settings);
  const closeModals = useSession((s) => s.closeModals);
  const info = useSession((s) => s.info);
  const session = useSession((s) => s.session);
  const toast = useSession((s) => s.toast);
  const [apimEnv, setApimEnv] = useState<'preprod' | 'prod'>('preprod');
  const [apimEnabled, setApimEnabled] = useState(true);
  const [journalCount, setJournalCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !info) return;
    setApimEnv(info.apim?.env ?? 'preprod');
    setApimEnabled(info.apim?.enabled ?? true);
    void (async () => {
      try {
        const r = await sc.rpc<{ entries: unknown[] }>('renamer.journal', {});
        setJournalCount(r.entries.length);
      } catch {
        setJournalCount(null);
      }
    })();
  }, [open, info]);

  if (!open) return null;

  const applyApim = async (env: 'preprod' | 'prod', enabled: boolean) => {
    setApimEnv(env);
    setApimEnabled(enabled);
    try {
      await sc.rpc('system.set_apim', { env, enabled });
      const i = useSession.getState().info;
      if (i) {
        useSession.setState({ info: { ...i, apim: { env, enabled } } });
      }
      toast('ok', 'Настройки APIM сохранены', `окружение: ${env} · APIM ${enabled ? 'включён' : 'выключен'}`);
    } catch (e) {
      toast('err', 'Не удалось применить', errMsg(e));
    }
  };

  const clearJournal = async () => {
    try {
      const r = await sc.rpc<{ cleared: number }>('renamer.journal_clear', {});
      setJournalCount(0);
      toast('ok', 'Журнал Undo очищен', `удалено записей: ${r.cleared}`);
    } catch (e) {
      toast('err', 'Ошибка', errMsg(e));
    }
  };

  const row = 'flex items-center justify-between gap-3 px-4 py-2.5';
  const label = 'text-[12.5px] text-tx-2 font-medium';
  const mono = 'text-[11px] font-mono text-tx-3 truncate max-w-[300px]';

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[4px] flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModals();
      }}
    >
      <div className="w-[560px] max-w-[92vw] max-h-[88vh] bg-[#1C1E26] border border-white/15 rounded-pop shadow-lift flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="text-[16px] font-bold flex items-center gap-2">
            <Settings size={18} className="text-accent-text" />
            Настройки
          </div>
          <button
            onClick={closeModals}
            className="w-7 h-7 rounded-md grid place-items-center text-tx-3 hover:bg-elevated hover:text-tx-1"
          >
            ✕
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex flex-col gap-4 flex-1">
          {/* Sidecar */}
          <section className="bg-panel rounded-lg border border-white/5">
            <div className="px-4 py-2 border-b border-white/5 text-[11px] font-bold tracking-wide text-tx-3 uppercase">
              Sidecar (Python)
            </div>
            <div className={row}>
              <span className={label}>Статус</span>
              <span className="text-[12px] font-semibold flex items-center gap-1.5">
                <span className={sc.isTauri() ? 'w-2 h-2 rounded-full bg-ok inline-block' : 'w-2 h-2 rounded-full bg-warn inline-block'} />
                {info ? `онлайн · порт ${info.port}` : 'офлайн'}
              </span>
            </div>
            <div className={row}>
              <span className={label}>Версия</span>
              <span className="font-mono text-[12px] text-tx-1">{info?.version ?? '—'}</span>
            </div>
            <div className={row}>
              <span className={label}>Движки ШК</span>
              <span className="flex gap-1.5">
                {info &&
                  (
                    [
                      ['OpenCV', info.engines.opencv],
                      ['ZXing', info.engines.zxing],
                      ['PyZBar', info.engines.pyzbar],
                    ] as const
                  ).map(([n, ok]) => (
                    <span
                      key={n}
                      className={
                        'px-1.5 py-0.5 rounded text-[10.5px] font-mono font-semibold ' +
                        (ok ? 'bg-ok/15 text-ok' : 'bg-white/5 text-tx-3')
                      }
                    >
                      {n}
                    </span>
                  ))}
              </span>
            </div>
            <div className={row}>
              <span className={label}>Кэш ШК→артикул</span>
              <span className="font-mono text-[12px] text-tx-1">{info?.cache_count ?? 0}</span>
            </div>
            <div className={row}>
              <span className={label}>Данные</span>
              <span className={mono} title={info?.data_dir}>{info?.data_dir ?? '—'}</span>
            </div>
            {session?.zayavka && (
              <div className={row}>
                <span className={label}>Заявка</span>
                <span className={mono} title={session.zayavka}>
                  {session.zayavka.split(/[\\/]/).pop()}
                </span>
              </div>
            )}
          </section>

          {/* APIM */}
          <section className="bg-panel rounded-lg border border-white/5">
            <div className="px-4 py-2 border-b border-white/5 text-[11px] font-bold tracking-wide text-tx-3 uppercase">
              APIM v3 (Leroy Merlin)
            </div>
            <div className="px-4 py-2 text-[11px] text-tx-3 border-b border-white/5">
              Используется, когда товар не найден в заявке и в локальном кэше.
              customerId: {info ? '60071799 (preprod)' : '60071799'}.
            </div>
            <div className={row}>
              <span className={label}>Окружение</span>
              <select
                value={apimEnv}
                onChange={(e) => void applyApim(e.target.value as 'preprod' | 'prod', apimEnabled)}
                className="h-8 bg-input border border-white/10 rounded-md px-2 text-[12px] font-mono outline-none focus:border-accent"
              >
                <option value="preprod">preprod</option>
                <option value="prod">prod</option>
              </select>
            </div>
            <div className={row}>
              <span className={label}>Запросы к APIM</span>
              <button
                onClick={() => void applyApim(apimEnv, !apimEnabled)}
                className={
                  'relative w-9 h-5 rounded-full transition-colors ' +
                  (apimEnabled ? 'bg-accent-fill' : 'bg-white/15')
                }
                aria-pressed={apimEnabled}
              >
                <span
                  className={
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ' +
                    (apimEnabled ? 'left-[18px]' : 'left-0.5')
                  }
                />
              </button>
            </div>
          </section>

          {/* Журнал */}
          <section className="bg-panel rounded-lg border border-white/5">
            <div className="px-4 py-2 border-b border-white/5 text-[11px] font-bold tracking-wide text-tx-3 uppercase">
              Журнал Undo
            </div>
            <div className={row}>
              <span className={label}>Записей</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[12px] text-tx-1">
                  {journalCount === null ? '…' : journalCount}
                </span>
                <button
                  onClick={() => void clearJournal()}
                  disabled={journalCount === 0}
                  className="h-7 px-3 rounded-md bg-danger/15 text-danger text-[11.5px] font-semibold hover:bg-danger/25 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  <Trash2 size={13} />
                  Очистить
                </button>
              </span>
            </div>
          </section>

          {/* Горячие клавиши */}
          <section className="bg-panel rounded-lg border border-white/5">
            <div className="px-4 py-2 border-b border-white/5 text-[11px] font-bold tracking-wide text-tx-3 uppercase">
              Горячие клавиши
            </div>
            <div className="px-4 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]">
              <span className="text-tx-3">⌘Z</span><span className="text-tx-2">Отменить переименование</span>
              <span className="text-tx-3">R</span><span className="text-tx-2">Ввести ШК (для товаров с ошибкой)</span>
              <span className="text-tx-3">Space</span><span className="text-tx-2">Лайтбокс активного товара</span>
              <span className="text-tx-3">Esc</span><span className="text-tx-2">Закрыть окно / снять выбор</span>
            </div>
          </section>
        </div>

        <div className="px-5 py-3 flex items-center justify-between gap-3 border-t border-white/10 flex-shrink-0">
          <div className="text-[11px] text-tx-3">
            RAW Renamer Studio · Tauri 2 + React + FastAPI sidecar
          </div>
          <button
            onClick={closeModals}
            className="h-9 px-5 rounded-lg bg-accent-fill hover:bg-[#6A57E2] text-white text-[12.5px] font-bold"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
