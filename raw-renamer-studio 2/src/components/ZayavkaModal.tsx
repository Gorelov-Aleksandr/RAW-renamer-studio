import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, FolderUp, UploadCloud, RefreshCw } from 'lucide-react';
import { useSession, errMsg } from '../store/useSession';
import * as sc from '../lib/sidecar';
import { cx } from '../lib/cx';

interface GenResult {
  out_path: string;
  count: number;
  date: string;
  preview: { lm: string; otdel: string; name: string; gtin: string; model: string }[];
}

/**
 * v3.1:
 *  A. Открыть СУЩЕСТВУЮЩУЮ заявку .xlsx (нативный диалог Tauri / загрузка в браузере)
 *     → сразу подключается к сессии (session.set_zayavka → enrich).
 *  B. Сгенерировать заявку из PIM-выгрузки (CSV): без полей «Фотограф»,
 *     «Организация», «Дата съёмки» (org — «photo production» фиксированно,
 *     остальное — вручную в Excel); дата — в имени файла. После генерации
 *     заявка автоматически подключается к сессии.
 */
export default function ZayavkaModal() {
  const open = useSession((s) => s.modals.zayavka);
  const closeModals = useSession((s) => s.closeModals);
  const info = useSession((s) => s.info);
  const session = useSession((s) => s.session);
  const online = useSession((s) => s.online);
  const toast = useSession((s) => s.toast);
  const loadZayavka = useSession((s) => s.loadZayavka);
  const [status, setStatus] = useState('');
  const [gen, setGen] = useState<GenResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);

  const pickXlsx = async () => {
    if (!online) {
      toast('warn', 'Sidecar офлайн', 'Загрузка заявки недоступна — запустите Python sidecar');
      return;
    }
    // Tauri: нативный выбор файла
    try {
      if (sc.isTauri()) {
        const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
        const path = await openDialog({
          directory: false,
          multiple: false,
          filters: [{ name: 'Excel', extensions: ['xlsx'] }],
          title: 'Файл заявки (.xlsx)',
        });
        if (typeof path === 'string' && path) {
          await loadZayavka(path);
        }
        return;
      }
    } catch {
      /* нет tauri — браузерный ввод ниже */
    }
    // BUG-002: браузер — нативный <input type=file>. Стратегия «двойной
    // кликабельный путь»: сначала скрытый input, fallback — временный input.
    if (xlsxRef.current) {
      xlsxRef.current.click();
      return;
    }
    const tmp = document.createElement('input');
    tmp.type = 'file';
    tmp.accept = '.xlsx';
    tmp.onchange = () => {
      const f = tmp.files?.[0];
      if (f) void onXlsxFile(f);
    };
    document.body.appendChild(tmp);
    tmp.click();
    window.setTimeout(() => tmp.remove(), 60000);
  };

  const onXlsxFile = async (file: File) => {
    setBusy(true);
    setStatus('Загрузка ' + file.name + '…');
    try {
      const up = await sc.uploadFile(file);
      await loadZayavka(up.path);
    } catch (e) {
      setStatus('Ошибка: ' + errMsg(e));
      toast('err', 'Не удалось загрузить заявку', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const generate = async (csvPath: string) => {
    setBusy(true);
    setStatus('Генерация заявки…');
    setGen(null);
    try {
      // Tauri: спрашиваем каталог сохранения (master §5)
      let outDir: string | null = null;
      if (sc.isTauri()) {
        try {
          const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
          const dir = await openDialog({
            directory: true,
            multiple: false,
            title: 'Каталог сохранения заявки',
          });
          if (typeof dir !== 'string' || !dir) {
            setBusy(false);
            setStatus('Сохранение отменено');
            return;
          }
          outDir = dir;
        } catch {
          /* если диалог недоступен — генерим в data-dir */
        }
      }
      const r = await sc.rpc<GenResult>('zayavka.generate', {
        csv_path: csvPath,
        fmt: 'xlsx',
        out_path: outDir,
      });
      setGen(r);
      setStatus(`Готово: ${r.count} товаров → ${r.out_path.split(/[\\/]/).pop()}`);
      await loadZayavka(r.out_path);
    } catch (e) {
      setStatus('Ошибка: ' + errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const onCsvFile = async (file: File) => {
    setBusy(true);
    setStatus('Загрузка ' + file.name + '…');
    try {
      const up = await sc.uploadFile(file);
      await generate(up.path);
    } catch (e) {
      setBusy(false);
      setStatus('Ошибка: ' + errMsg(e));
    }
  };

  const download = async () => {
    if (!gen) return;
    try {
      const r = await sc.rpc<{ name: string; data_b64: string }>('file.download', {
        path: gen.out_path,
      });
      const bin = atob(r.data_b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = gen.out_path.split(/[\\/]/).pop() ?? 'zayavka.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast('ok', 'Заявка сохранена', a.download);
    } catch (e) {
      toast('err', 'Ошибка скачивания', errMsg(e));
    }
  };

  if (!open) return null;

  const zayName = session?.zayavka ? session.zayavka.split(/[\\/]/).pop() : null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[4px] flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModals();
      }}
    >
      <div className="w-[840px] max-w-[92vw] max-h-[88vh] bg-[#1C1E26] border border-white/15 rounded-pop shadow-lift flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <div className="text-[16px] font-bold flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-accent-text" />
              Заявка на съёмку
            </div>
            <div className="text-[12px] text-tx-3 mt-1">
              Открыть готовую заявку .xlsx или сгенерировать из выгрузки PIM.
              Заявка автоматически подключается к текущей сессии.
            </div>
          </div>
          <button
            onClick={closeModals}
            className="w-7 h-7 rounded-md grid place-items-center text-tx-3 hover:bg-elevated hover:text-tx-1"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex flex-col gap-4 flex-1">
          {/* BUG-006: явный офлайн-баннер вместо тостов-ошибок на каждом действии */}
          {!online && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-warn/10 border border-warn/30 text-[12.5px] text-tx-1">
              <span className="w-2 h-2 rounded-full bg-warn flex-shrink-0" />
              <span>
                <b>Sidecar офлайн.</b> Загрузка и генерация заявки недоступны —
                запустите Python sidecar (статус — в шапке приложения).
              </span>
            </div>
          )}

          {/* Статус подключения */}
          <div className="flex items-center gap-3">
            <div
              className={cx(
                'flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-[12.5px] flex-1',
                zayName
                  ? 'bg-ok/10 border-ok/30 text-tx-1'
                  : 'bg-panel border-white/10 text-tx-3',
              )}
            >
              <FileSpreadsheet size={15} className={zayName ? 'text-ok' : ''} />
              {zayName ? (
                <span>
                  Подключена: <span className="font-mono font-semibold">{zayName}</span>
                </span>
              ) : (
                <span>Заявка к сессии не подключена</span>
              )}
            </div>
            {zayName && (
              <button
                onClick={() => void useSession.getState().refreshAngles()}
                disabled={!online}
                className={cx(
                  'h-[38px] px-3 rounded-lg bg-surface border border-white/10 text-tx-1 text-[12px] font-semibold hover:bg-elevated inline-flex items-center gap-1.5 flex-shrink-0',
                  !online && 'opacity-40 cursor-not-allowed',
                )}
                title={online ? 'Обновить количество ракурсов в заявке на основе реальных файлов' : 'Sidecar офлайн — недоступно'}
              >
                <RefreshCw size={14} className="text-accent-text" />
                Обновить ракурсы
              </button>
            )}
          </div>

          {/* A. Открыть существующую */}
          <div className="bg-panel rounded-lg border border-white/5 p-4 flex flex-col gap-2.5">
            <div className="text-[12px] font-bold tracking-wide text-tx-2 uppercase">
              A · Открыть существующую заявку (.xlsx)
            </div>
            <div className="text-[11.5px] text-tx-3">
              Формат: A(1) — Код LM, D(4) — Штрих-код. После открытия товары
              сопоставятся автоматически (Код LM, название, строка).
            </div>
            <input
              ref={xlsxRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onXlsxFile(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => void pickXlsx()}
              disabled={!online}
              className={cx(
                'h-9 px-4 rounded-lg bg-surface border border-white/10 text-tx-1 text-[12.5px] font-semibold hover:bg-elevated inline-flex items-center gap-2 self-start',
                !online && 'opacity-40 cursor-not-allowed',
              )}
              title={online ? 'Выбрать .xlsx с системы (нативный диалог)' : 'Sidecar офлайн — недоступно'}
            >
              <FolderUp size={15} className="text-accent-text" />
              Выбрать файл заявки…
            </button>
          </div>

          {/* B. Генератор из PIM */}
          <div className="bg-panel rounded-lg border border-white/5 p-4 flex flex-col gap-2.5">
            <div className="text-[12px] font-bold tracking-wide text-tx-2 uppercase">
              B · Сгенерировать из выгрузки PIM (CSV)
            </div>
            {/* BUG-003: зона Drag&Drop + клик — работают в браузере и Tauri;
                при офлайне sidecar — блокируется с подсказкой */}
            <div
              role="button"
              aria-disabled={!online}
              onClick={() => {
                if (!online) {
                  toast('warn', 'Sidecar офлайн', 'Загрузка CSV недоступна — запустите Python sidecar');
                  return;
                }
                if (csvRef.current) {
                  csvRef.current.click();
                  return;
                }
                const tmp = document.createElement('input');
                tmp.type = 'file';
                tmp.accept = '.csv,.tsv,.txt';
                tmp.onchange = () => {
                  const f = tmp.files?.[0];
                  if (f) void onCsvFile(f);
                };
                document.body.appendChild(tmp);
                tmp.click();
                window.setTimeout(() => tmp.remove(), 60000);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                if (online) setDrag(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = online ? 'copy' : 'none';
                if (online) setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (!online) {
                  toast('warn', 'Sidecar офлайн', 'Загрузка CSV недоступна — запустите Python sidecar');
                  return;
                }
                const f = e.dataTransfer.files?.[0];
                if (f) void onCsvFile(f);
              }}
              className={cx(
                'border-2 border-dashed rounded-lg px-6 py-5 text-center transition-colors bg-surface',
                online ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                drag ? 'border-accent bg-accent/5' : 'border-white/15 hover:border-white/25',
              )}
            >
              <input
                ref={csvRef}
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onCsvFile(f);
                  e.target.value = '';
                }}
              />
              <UploadCloud size={26} className="mx-auto text-accent-text mb-2" />
              <div className="text-[13px] font-semibold">
                Перетащите export_*.csv или кликните для выбора
              </div>
              <div className="text-[11.5px] text-tx-3 mt-1">
                Кодировки UTF-16 LE/BE · UTF-8 · cp1251 (автодетект) · разделители Tab, «;», «,»
              </div>
              {info?.demo && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!online) {
                      toast('warn', 'Sidecar офлайн', 'Демо-выгрузка недоступна — запустите Python sidecar');
                      return;
                    }
                    void generate(info.demo!.pim);
                  }}
                  className={cx(
                    'mt-3 h-8 px-4 rounded-lg bg-surface border border-white/10 text-tx-1 text-[12px] font-semibold hover:bg-elevated inline-flex items-center gap-2',
                    !online && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  Загрузить демо-выгрузку PIM (6 товаров)
                </button>
              )}
            </div>
            <div className="text-[11px] text-tx-3 bg-surface rounded-md px-3 py-2 border border-white/5">
              Заполнение: <b className="text-tx-2">Организация</b> — «photo production»
              (автоматически). <b className="text-tx-2">Фотограф</b> и{' '}
              <b className="text-tx-2">«Дата съёмки»</b> — поля оставлены пустыми
              (заполняются вручную в Excel, при необходимости — 2 фотографа).
              Дата отражается в имени файла: <span className="font-mono">zayavka_ДД.ММ.ГГГГ.xlsx</span>.
            </div>
          </div>

          {gen && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <div className="text-[12px] font-semibold">
                  Распознано товаров:{' '}
                  <span className="text-accent-text font-mono">{gen.count}</span>
                </div>
                <div className="text-[11px] text-tx-3">
                  Колонки L (12) и M (13) готовы для переименования
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto border border-white/10 rounded-lg bg-surface">
                <table className="w-full border-collapse text-[11px] text-left">
                  <thead className="sticky top-0 bg-panel text-tx-2">
                    <tr className="border-b border-white/10">
                      <th className="px-2.5 py-1.5 font-semibold">Код LM</th>
                      <th className="px-2.5 py-1.5 font-semibold">Отдел</th>
                      <th className="px-2.5 py-1.5 font-semibold">Товар</th>
                      <th className="px-2.5 py-1.5 font-semibold">GTIN</th>
                      <th className="px-2.5 py-1.5 font-semibold">Модель ADEO</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {gen.preview.map((r, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="px-2.5 py-1.5 font-semibold text-tx-1">{r.lm}</td>
                        <td className="px-2.5 py-1.5 text-tx-3">{r.otdel}</td>
                        <td className="px-2.5 py-1.5 text-tx-2 max-w-[260px] truncate" title={r.name}>
                          {r.name || <span className="text-warn">Без названия</span>}
                        </td>
                        <td className="px-2.5 py-1.5 text-accent-text">{r.gtin || '—'}</td>
                        <td className="px-2.5 py-1.5 text-tx-3">{r.model || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 flex items-center justify-between gap-3 border-t border-white/10 flex-shrink-0">
          <div className="text-[11.5px] text-tx-2 truncate">{status || (busy ? 'Обработка…' : '')}</div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={closeModals}
              className="h-9 px-4 rounded-lg bg-surface border border-white/10 text-tx-1 text-[12.5px] font-semibold hover:bg-elevated"
            >
              Закрыть
            </button>
            {gen && !sc.isTauri() && (
              <button
                onClick={() => void download()}
                disabled={!online}
                className={cx(
                  'h-9 px-4 rounded-lg bg-accent-fill hover:bg-[#6A57E2] text-white text-[12.5px] font-bold flex items-center gap-2',
                  !online && 'opacity-40 cursor-not-allowed',
                )}
              >
                <Download size={14} />
                Скачать заявку (.xlsx)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
