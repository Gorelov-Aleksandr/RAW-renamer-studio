import { create } from 'zustand';
import * as sc from '../lib/sidecar';
import type { Item, Mode, PlanRow, SessionData, SystemInfo } from '../types';

export interface Toast {
  id: number;
  kind: 'ok' | 'warn' | 'err' | 'info' | 'undo';
  title: string;
  sub?: string;
  actionLabel?: string;
  action?: () => void;
}

export type Filter = 'all' | 'ok' | 'warn' | 'err' | 'new';

interface AppState {
  online: boolean;
  /** ЗАМ-001: раздельные состояния (starting до первого online — не пугать красным) */
  engineState: sc.EngineState;
  /** v3.5: стадия запуска 0..3 (прогресс-индикатор) */
  bootStage: number;
  info: SystemInfo | null;
  session: SessionData | null;
  activeId: string | null;
  selection: string[];
  filter: Filter;
  search: string;
  zoom: number;
  plan: PlanRow[] | null;
  planItemIds: string[] | null;
  planSkipped: number;
  modals: {
    rename: boolean;
    barcode: boolean;
    zayavka: boolean;
    settings: boolean;
    help: boolean;
    about: boolean;
    palette: boolean;
  };
  lightbox: { src: string; cap: string } | null;
  toasts: Toast[];
  busy: boolean;
  lastExcelTs: number;

  init: () => void;
  toast: (kind: Toast['kind'], title: string, sub?: string, actionLabel?: string, action?: () => void) => void;
  dropToast: (id: number) => void;
  setFilter: (f: Filter) => void;
  setSearch: (s: string) => void;
  setZoom: (z: number) => void;
  select: (id: string, additive?: boolean) => void;
  setActive: (id: string | null) => void;
  openFolder: (folder: string, mode?: Mode, zayavka?: string) => Promise<void>;
  flipMode: () => void;
  loadZayavka: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshAngles: () => Promise<void>;
  moveFrame: (itemId: string, from: number, to: number) => Promise<void>;
  setSuffix: (itemId: string, idx: number, suffix: string | null) => Promise<void>;
  toggleLabel: (itemId: string, idx: number) => Promise<void>;
  applyBarcode: (itemId: string, barcode: string) => Promise<void>;
  makePlan: (itemIds?: string[]) => Promise<void>;
  executePlan: () => Promise<void>;
  undoLast: () => Promise<void>;
  retryXlsx: () => Promise<void>;
  setModal: (
    m: 'rename' | 'barcode' | 'zayavka' | 'settings' | 'help' | 'about' | 'palette',
    open: boolean,
  ) => void;
  closeModals: () => void;
  setLightbox: (lb: AppState['lightbox']) => void;
}

let inited = false;
let infoFetched = false;
let lastToastKey = '';
let lastToastTs = 0;

export const useSession = create<AppState>()((set, get) => ({
  online: false,
  info: null,
  session: null,
  activeId: null,
  selection: [],
  filter: 'all',
  search: '',
  zoom: 100,
  plan: null,
  planItemIds: null,
  planSkipped: 0,
  modals: { rename: false, barcode: false, zayavka: false, settings: false, help: false, about: false, palette: false },
  lightbox: null,
  toasts: [],
  busy: false,
  lastExcelTs: 0,
  engineState: 'starting',
  bootStage: 0,

  init: () => {
    if (inited) return;
    inited = true;
    sc.initSidecar(
      (status) => {
        // ЗАМ-001: состояние движка (starting/online/offline) + online-булеан
        // для блокировок кнопок.
        set({ engineState: status.status, online: status.status === 'online' });
        // v3.5: автооткрытия при старте нет — просто спрашиваем info
        // (версия, движки, статус APIM) для шапки и настроек.
        const isOnline = status.status === 'online';
        if (isOnline && !infoFetched) {
          infoFetched = true;
          void (async () => {
            try {
              set({ info: await sc.rpc<SystemInfo>('system.info') });
            } catch {
              /* движок не отвечает — баннер offline покажет состояние */
            }
          })();
        }
      },
      (e) => {
        if (e.kind === 'error') {
          get().toast('err', 'Ошибка приложения', e.message);
        }
        if (e.kind === 'dead') {
          // 'dead' — сразу offline, не ждём двух провалов heartbeat.
          set({ engineState: 'offline', online: false, bootStage: 0 });
        }
        if (e.kind === 'progress') {
          // v3.5: стадии запуска. 0 = новый запуск (сброс), иначе — монотонно вверх.
          const cur = get().bootStage;
          if (e.stage === 0 || e.stage > cur) set({ bootStage: e.stage });
        }
        if (e.kind === 'ready') {
          set({ bootStage: 3, engineState: 'online', online: true });
          void (async () => {
            try {
              set({ info: await sc.rpc<SystemInfo>('system.info') });
            } catch {
              /* движок не отвечает — баннер offline покажет состояние */
            }
          })();
        }
        // 'ready' — уже обработан внутри клиента (baseUrl + online)
      },
    );
  },

  toast: (kind, title, sub, actionLabel, action) => {
    // ЗАМ-002: dedup — одинаковый тост (kind+title+sub) не чаще раза в 3 с.
    // Без этого «Движок недоступен» мог накрыть экран толпой.
    const key = `${kind}|${title}|${sub ?? ''}`;
    const now = Date.now();
    if (key === lastToastKey && now - lastToastTs < 3000) return;
    lastToastKey = key;
    lastToastTs = now;
    const id = Date.now() + Math.floor(Math.random() * 1000);
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, title, sub, actionLabel, action }] }));
    window.setTimeout(() => get().dropToast(id), 6500);
  },
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setFilter: (f) => set({ filter: f }),
  setSearch: (search) => set({ search }),
  setZoom: (z) => set({ zoom: Math.max(75, Math.min(150, z)) }),

  select: (id, additive) => {
    const s = get();
    set({
      selection: additive
        ? s.selection.includes(id)
          ? s.selection.filter((x) => x !== id)
          : [...s.selection, id]
        : [id],
    });
    set({ activeId: id });
  },
  setActive: (id) => set({ activeId: id }),

  openFolder: async (folder, mode = 'cv', zayavka) => {
    set({ busy: true });
    try {
      const r = await sc.rpc<SessionData & { total_frames: number; warnings: string[] }>(
        'session.open_folder',
        { folder, mode, zayavka: zayavka ?? null },
      );
      set({ session: r, activeId: r.items[0]?.id ?? null, filter: 'all', search: '', selection: [] });
      const ok = r.items.filter((i) => i.status === 'ok').length;
      const err = r.items.filter((i) => i.status === 'err').length;
      get().toast(
        'ok',
        'Партия загружена',
        `${r.items.length} товаров · ${r.total_frames} кадров · готово: ${ok}${err ? ` · требует внимания: ${err}` : ''}`,
      );
    } catch (e) {
      get().toast('err', 'Не удалось открыть папку', errMsg(e));
    } finally {
      set({ busy: false });
    }
  },

  flipMode: () => {
    const s = get().session;
    if (!s?.folder) return;
    void get().openFolder(s.folder, s.mode === 'cv' ? 'names' : 'cv', s.zayavka ?? undefined);
  },

  loadZayavka: async (path) => {
    try {
      const r = await sc.rpc<{ items: Item[] }>('session.set_zayavka', { path });
      set((s) => ({
        session: s.session ? { ...s.session, zayavka: path, items: r.items } : s.session,
      }));
      const withLm = r.items.filter((i) => i.lm_code).length;
      get().toast('ok', 'Заявка загружена', `Сопоставлено ${withLm} из ${r.items.length} товаров`);
    } catch (e) {
      get().toast('err', 'Ошибка заявки', errMsg(e));
    }
  },

  refresh: async () => {
    try {
      const r = await sc.rpc<SessionData>('session.get');
      set({ session: r });
    } catch {
      /* ignore */
    }
  },

  refreshAngles: async () => {
    set({ busy: true });
    try {
      const r = await sc.rpc<{ updated: number; changes?: { lm: string; old_L: number; new_L: number; old_M: number; new_M: number }[] }>(
        'session.refresh_angles',
        {},
      );
      if (r.updated === 0) {
        get().toast('info', 'Ракурсы актуальны', 'Все данные в заявке совпадают с файлами');
      } else {
        const details = r.changes?.slice(0, 5).map(c => `${c.lm}: ${c.old_L}→${c.new_L}`).join(', ');
        get().toast(
          'ok',
          'Ракурсы обновлены',
          `Обновлено ${r.updated} строк${r.changes && r.changes.length > 5 ? ` (показаны первые 5)` : ''}: ${details}${r.changes && r.changes.length > 5 ? '…' : ''}`,
        );
      }
      await get().refresh();
    } catch (e) {
      get().toast('err', 'Ошибка обновления ракурсов', errMsg(e));
    } finally {
      set({ busy: false });
    }
  },

  moveFrame: async (itemId, from, to) => {
    const sess = get().session;
    if (!sess) return;
    const items = sess.items.map((it) =>
      it.id === itemId ? { ...it, frames: arrayMoveLocal(it.frames, from, to) } : it,
    );
    set({ session: { ...sess, items } });
    try {
      await sc.rpc('session.move_frame', { item_id: itemId, from_idx: from, idx: to });
    } catch (e) {
      get().toast('err', 'Не удалось переместить кадр', errMsg(e));
      await get().refresh();
    }
  },

  setSuffix: async (itemId, idx, suffix) => {
    try {
      const r = await sc.rpc<{ frames: Item['frames']; has_label?: boolean; status?: Item['status'] }>('session.set_frame_suffix', {
        item_id: itemId,
        idx,
        suffix: suffix ?? null,
      });
      set((s) => ({
        session: s.session
          ? {
              ...s.session,
              items: s.session.items.map((it) =>
                it.id === itemId
                  ? {
                      ...it,
                      frames: r.frames,
                      has_label: r.has_label !== undefined ? r.has_label : it.has_label,
                      status: r.status !== undefined ? r.status : it.status,
                    }
                  : it,
              ),
            }
          : s.session,
      }));
    } catch (e) {
      get().toast('err', 'Недопустимый суффикс', errMsg(e));
    }
  },

  toggleLabel: async (itemId, idx) => {
    try {
      const r = await sc.rpc<{ frames: Item['frames']; has_label: boolean; status: Item['status'] }>(
        'session.toggle_frame_label',
        { item_id: itemId, idx },
      );
      set((s) => ({
        session: s.session
          ? {
              ...s.session,
              items: s.session.items.map((it) =>
                it.id === itemId
                  ? { ...it, frames: r.frames, has_label: r.has_label, status: r.status }
                  : it,
              ),
            }
          : s.session,
      }));
    } catch (e) {
      get().toast('err', 'Ошибка изменения этикетки', errMsg(e));
    }
  },

  applyBarcode: async (itemId, barcode) => {
    try {
      await sc.rpc('session.apply_barcode', { item_id: itemId, barcode });
      set((s) => ({ modals: { ...s.modals, barcode: false } }));
      get().toast('ok', 'Штрихкод применён', 'Товар сопоставлен: заявка → кэш → APIM v3');
      await get().refresh();
    } catch (e) {
      get().toast('err', 'Ошибка', errMsg(e));
    }
  },

  makePlan: async (itemIds) => {
    set({ busy: true });
    try {
      const r = await sc.rpc<{ rows: PlanRow[]; skipped: { item_id: string; reason: string }[]; xlsx: string | null }>(
        'renamer.plan',
        { item_ids: itemIds ?? null },
      );
      if (!r.rows.length) {
        get().toast('warn', 'Нечего переименовывать', r.skipped.length ? 'Товары без кода LM пропущены — введите ШК вручную' : undefined);
        return;
      }
      set({ plan: r.rows, planItemIds: itemIds ?? null, planSkipped: r.skipped.length, modals: { ...get().modals, rename: true } });
    } catch (e) {
      get().toast('err', 'Не удалось построить план', errMsg(e));
    } finally {
      set({ busy: false });
    }
  },

  executePlan: async () => {
    const st = get();
    if (!st.plan || st.busy) return;
    set({ busy: true });
    try {
      const r = await sc.rpc<{
        renamed: number;
        items?: Item[];
        xlsx: { updated: number; added: number; locked: boolean; message?: string };
        journal_id: string;
      }>('renamer.execute', { item_ids: st.planItemIds });
      if (r.items) {
        set((s) => ({ session: s.session ? { ...s.session, items: r.items! } : s.session }));
      }
      set({ modals: { ...st.modals, rename: false }, plan: null, planItemIds: null, lastExcelTs: Date.now() });
      if (r.xlsx.locked) {
        get().toast('err', 'Excel заблокирован', r.xlsx.message ?? 'Закройте файл в Excel и нажмите «Повторить»', 'Повторить', () => void get().retryXlsx());
      } else {
        const x = r.xlsx;
        get().toast(
          'ok',
          'Переименование выполнено',
          `${r.renamed} файлов · Excel: L/M обновлены (${x.updated}${x.added ? `, +${x.added} новых строк` : ''})`,
          'Отменить ⌘Z',
          () => void get().undoLast(),
        );
      }
      await get().refresh();
    } catch (e) {
      get().toast('err', 'Ошибка переименования', errMsg(e));
    } finally {
      set({ busy: false });
    }
  },

  undoLast: async () => {
    if (get().busy) return;
    if (!get().online) {
      get().toast('info', 'Движок не отвечает', 'Отмена недоступна — перезапустите приложение');
      return;
    }
    set({ busy: true });
    try {
      const r = await sc.rpc<{ restored: number; xlsx: { restored?: number; locked?: boolean; message?: string } | null }>('renamer.undo', {});
      const x = r.xlsx;
      const xmsg = x?.locked ? ' · Excel по-прежнему заблокирован' : x?.restored ? ' · Excel восстановлен' : '';
      get().toast('undo', 'Отменено', `${r.restored} файлов возвращены к прежним именам${xmsg}`);
      await get().refresh();
    } catch (e) {
      get().toast('err', 'Не удалось отменить', errMsg(e));
    } finally {
      set({ busy: false });
    }
  },

  retryXlsx: async () => {
    try {
      const r = await sc.rpc<{ written: number }>('renamer.retry_xlsx', {});
      get().toast('ok', 'Excel обновлён', `Строк записано: ${r.written}`);
      set({ lastExcelTs: Date.now() });
    } catch (e) {
      get().toast('err', 'Excel по-прежнему заблокирован', errMsg(e));
    }
  },

  setModal: (m, open) => set((s) => ({ modals: { ...s.modals, [m]: open } })),
  closeModals: () =>
    set({
      modals: {
        rename: false,
        barcode: false,
        zayavka: false,
        settings: false,
        help: false,
        about: false,
        palette: false,
      },
    }),
  setLightbox: (lb) => set({ lightbox: lb }),
}));

function arrayMoveLocal<T>(arr: T[], from: number, to: number): T[] {
  const a = [...arr];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

export function errMsg(e: unknown): string {
  if (e instanceof sc.SidecarError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
