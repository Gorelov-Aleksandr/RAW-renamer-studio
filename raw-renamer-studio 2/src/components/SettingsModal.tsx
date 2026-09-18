import { useEffect, useState } from 'react';
import { Settings, Trash2 } from 'lucide-react';
import { useSession, errMsg } from '../store/useSession';
import * as sc from '../lib/sidecar';
import { log } from '../lib/logger';
import { cx } from '../lib/cx';

/**
 * v3.3 (L3): настройки разделены на «Базовые» (для фотографа) и «Про»
 * (технические: APIM-окружение, кэш, пути, движки, лог).
 */
export default function SettingsModal() {
  const open = useSession((s) => s.modals.settings);
  const closeModals = useSession((s) => s.closeModals);
  const info = useSession((s) => s.info);
  const engineState = useSession((s) => s.engineState);
  const session = useSession((s) => s.session);
  const toast = useSession((s) => s.toast);
  const [tab, setTab] = useState<'basic' | 'pro'>('basic');
  const [apimEnv, setApimEnv] = useState<'preprod' | 'prod'>('preprod');
  const [apimEnabled, setApimEnabled] = useState(true);
  const [journalCount, setJournalCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !info) return;
    setApimEnv(info.apim?.env ?? 'preprod');
    setApimEnabled(info.apim?.enabled ?? true);
    log('settings_open', 'info', { tab });
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
      toast('ok', 'Настройки сохранены', 'Применятся сразу и после перезапуска приложения');
    } catch (e) {
      toast('err', 'Не удалось применить', errMsg(e));
    }
  };

  const clearJournal = async () => {
    try {
      const r = await sc.rpc<{ cleared: number }>('renamer.journal_clear', {});
      setJournalCount(0);
      toast('ok', 'Журнал «Отменить» очищен', `удалено записей: ${r.cleared}`);
    } catch (e) {
      toast('err', 'Ошибка', errMsg(e));
    }
  };

  const row = 'flex items-center justify-between gap-3 px-4 py-2.5';
  const label = 'text-[12.5px] text-tx-2 font-medium';
  const mono = 'text-[11px] font-mono text-tx-3 truncate max-w-[300px]';
  const sectionTitle = 'px-4 py-2 border-b border-white/5 text-[11px] font-bold tracking-wide text-tx-3 uppercase';

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
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* v3.3: вкладки Базовые / Про */}
        <div className="flex gap-1 px-4 pt-3 flex-shrink-0">
          {(['basic', 'pro'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                'h-8 px-4 rounded-md text-[12.5px] font-semibold transition-colors',
                tab === t
                  ? 'bg-accent-tint text-accent-text border border-accent/30'
                  : 'text-tx-3 hover:bg-elevated hover:text-tx-1 border border-transparent',
              )}
            >
              {t === 'basic' ? 'Базовые' : 'Для профессионалов'}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto flex flex-col gap-4 flex-1">
          {tab === 'basic' ? (
            <>
              {/* Автопоиск товаров */}
              <section className="bg-panel rounded-lg border border-white/5">
                <div className={sectionTitle}>Поиск товаров</div>
                <div className={row}>
                  <div>
                    <div className={label}>Искать артикул автоматически</div>
                    <div className="text-[11px] text-tx-3 mt-0.5">
                      Если товара нет в заявке, приложение попросит его у сервера Леруа Мерлен
                    </div>
                  </div>
                  <button
                    onClick={() => void applyApim(apimEnv, !apimEnabled)}
                    className={
                      'relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ' +
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
                <div className={sectionTitle}>История переименований</div>
                <div className={row}>
                  <span className={label}>
                    Записей для «Отменить» (⌘Z)
                  </span>
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
                <div className={sectionTitle}>Горячие клавиши</div>
                <div className="px-4 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]">
                  <span className="text-tx-3">⌘O</span><span className="text-tx-2">Открыть папку съёмки</span>
                  <span className="text-tx-3">⌘Z</span><span className="text-tx-2">Отменить переименование</span>
                  <span className="text-tx-3">⌘K</span><span className="text-tx-2">Быстрые команды</span>
                  <span className="text-tx-3">R</span><span className="text-tx-2">Ввести ШК (для товаров с ошибкой)</span>
                  <span className="text-tx-3">Space</span><span className="text-tx-2">Посмотреть кадр крупно</span>
                  <span className="text-tx-3">Esc</span><span className="text-tx-2">Закрыть окно / снять выбор</span>
                </div>
              </section>

              <div className="px-1 text-[11px] text-tx-3">
                Совет: папку со съёмкой можно просто перетащить в окно приложения.
              </div>
            </>
          ) : (
            <>
              {/* APIM */}
              <section className="bg-panel rounded-lg border border-white/5">
                <div className={sectionTitle}>APIM v3 (Леруа Мерлен)</div>
                <div className="px-4 py-2 text-[11px] text-tx-3 border-b border-white/5">
                  Используется, когда товар не найден в заявке и в локальном кэше.
                </div>
                <div className={row}>
                  <span className={label}>Окружение</span>
                  <select
                    value={apimEnv}
                    onChange={(e) => void applyApim(e.target.value as 'preprod' | 'prod', apimEnabled)}
                    className="h-8 bg-input border border-white/10 rounded-md px-2 text-[12px] font-mono outline-none focus:border-accent"
                  >
                    <option value="preprod">preprod (тестовое)</option>
                    <option value="prod">prod (боевое)</option>
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

              {/* Sidecar */}
              <section className="bg-panel rounded-lg border border-white/5">
                <div className={sectionTitle}>Движок (Python sidecar)</div>
                <div className={row}>
                  <span className={label}>Статус</span>
                  <span className="text-[12px] font-semibold flex items-center gap-1.5">
                    <span className={info ? 'w-2 h-2 rounded-full bg-ok inline-block' : engineState === 'starting' ? 'w-2 h-2 rounded-full bg-tx-3 inline-block' : 'w-2 h-2 rounded-full bg-danger inline-block'} />
                    {info ? 'работает' : engineState === 'starting' ? 'запускается…' : 'не отвечает'}
                  </span>
                </div>
                <div className={row}>
                  <span className={label}>Версия</span>
                  <span className="font-mono text-[12px] text-tx-1">{info?.version ?? '—'}</span>
                </div>
                <div className={row}>
                  <span className={label}>Движки распознавания ШК</span>
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
                  <span className={label}>Кэш ШК → артикул</span>
                  <span className="font-mono text-[12px] text-tx-1">{info?.cache_count ?? 0}</span>
                </div>
                <div className={row}>
                  <span className={label}>Путь к данным</span>
                  <span className={mono} title={info?.data_dir}>{info?.data_dir ?? '—'}</span>
                </div>
                <div className={row}>
                  <span className={label}>Логи</span>
                  <span className={mono} title={info ? `${info.data_dir}/logs` : undefined}>
                    {info ? 'logs/sidecar.jsonl (с ротацией)' : '—'}
                  </span>
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
            </>
          )}
        </div>

        <div className="px-5 py-3 flex items-center justify-between gap-3 border-t border-white/10 flex-shrink-0">
          <div className="text-[11px] text-tx-3">
            RAW Renamer Studio · Tauri 2 + React + FastAPI
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
