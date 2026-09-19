/**
 * Выбор папки с RAW-файлами (master §6, BUG-001/BUG-005).
 *
 * Tauri  — нативный диалог выбора папки (@tauri-apps/plugin-dialog).
 * Браузер — File System Access API (showDirectoryPicker, Chromium) либо
 *           <input webkitdirectory>; файлы партии загружаются в sidecar
 *           (POST /upload, подпапка uploads/<имя_папки>) и открывается
 *           сессия на этой папке — дальше всё как в десктопе.
 */
import * as sc from './sidecar';
import { useSession, errMsg } from '../store/useSession';

/** RAW-форматы (зеркало RAW_EXTS в src-python/raw_engine.py). */
const RAW_EXTS = ['.cr2', '.cr3', '.arw', '.nef', '.orf', '.rw2', '.dng', '.raf', '.nrw', '.pef', '.x3f'];

export const RAW_EXTS_LIST = RAW_EXTS.join(', ');

export interface PickProgress {
  done: number;
  total: number;
  fileName: string;
}

export interface PickOptions {
  onProgress?: (p: PickProgress) => void;
  onDone?: (ok: boolean) => void;
}

function rawExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function folderNameFromFile(f: File): string {
  const rp = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
  return rp ? rp.split('/')[0] : '';
}

async function collectDir(dir: unknown, depth = 0, out: File[] = []): Promise<File[]> {
  const d = dir as {
    values: () => AsyncIterable<{ kind: string; getFile: () => Promise<File> }>;
  };
  if (depth > 4 || out.length > 8192) return out;
  for await (const entry of d.values()) {
    if (entry.kind === 'file') out.push(await entry.getFile());
    else if (entry.kind === 'directory') await collectDir(entry, depth + 1, out);
  }
  return out;
}

/** Браузерный выбор папки → загрузка RAW в sidecar → сессия. */
async function pickFolderBrowser(opts: PickOptions): Promise<void> {
  const st = useSession.getState();
  if (!st.online) {
    st.toast('warn', 'Движок не отвечает', 'Загрузка партии требует Python-движок — проверьте статус в шапке');
    opts.onDone?.(false);
    return;
  }

  let files: File[] = [];
  let folderName = '';
  let cancelled = false;

  const w = window as Window & { showDirectoryPicker?: (o?: { mode?: string }) => Promise<unknown> };
  if (typeof w.showDirectoryPicker === 'function') {
    // Chromium / Edge: нативный проводник выбора папки
    let handle: unknown;
    try {
      handle = await w.showDirectoryPicker({ mode: 'read' });
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') {
        opts.onDone?.(false);
        return; // пользователь отменил
      }
      st.toast('err', 'Не удалось открыть проводник', errMsg(e));
      opts.onDone?.(false);
      return;
    }
    const dirHandle = handle as { name?: string };
    folderName = dirHandle.name || `import_${Date.now()}`;
    files = await collectDir(handle);
  } else {
    // Firefox/Safari: <input webkitdirectory>
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.style.display = 'none';
    document.body.appendChild(input);
    const picked = await new Promise<File[] | null>((resolve) => {
      let settled = false;
      const finish = (v: File[] | null) => {
        if (settled) return;
        settled = true;
        input.removeEventListener('change', onChange);
        input.remove();
        resolve(v);
      };
      const onChange = () => finish(Array.from(input.files ?? []));
      input.addEventListener('change', onChange);
      window.setTimeout(() => finish(null), 60000); // страховка
      input.click();
    });
    if (!picked || picked.length === 0) {
      cancelled = true;
      opts.onDone?.(false);
      return;
    }
    files = picked;
    folderName = folderNameFromFile(picked[0]) || `import_${Date.now()}`;
  }

  const rawFiles = files.filter((f) => RAW_EXTS.includes(rawExt(f.name)));
  if (rawFiles.length === 0) {
    st.toast('warn', 'RAW-файлы не найдены', `В «${folderName}» нет файлов: ${RAW_EXTS_LIST}`);
    opts.onDone?.(false);
    return;
  }
  if (rawFiles.length < files.length) {
    st.toast('info', 'Выбраны только RAW', `${rawFiles.length} из ${files.length} файлов (остальные пропущены)`);
  }
  await importFilesAndOpen(rawFiles, folderName, opts);
}

/**
 * Импорт готового набора RAW-файлов: загрузка в sidecar + открытие сессии.
 * Вынесено из pickFolderBrowser, чтобы его смог использовать drag&drop.
 */
export async function importFilesAndOpen(
  rawFiles: File[],
  folderName: string,
  opts: PickOptions = {},
): Promise<void> {
  const st = useSession.getState();
  if (!st.online) {
    st.toast('warn', 'Движок не отвечает', 'Загрузка партии требует Python-движок — проверьте статус в шапке');
    opts.onDone?.(false);
    return;
  }
  if (rawFiles.length === 0) {
    st.toast('warn', 'RAW-файлы не найдены', `В «${folderName}» нет файлов: ${RAW_EXTS_LIST}`);
    opts.onDone?.(false);
    return;
  }
  const total = rawFiles.length;
  let firstPath: string | null = null;
  let ok = true;
  for (let i = 0; i < rawFiles.length; i++) {
    const f = rawFiles[i];
    try {
      const up = await sc.uploadFile(f, folderName);
      firstPath = firstPath ?? up.path;
      opts.onProgress?.({ done: i + 1, total, fileName: f.name });
    } catch (e) {
      ok = false;
      st.toast('err', 'Ошибка загрузки', `${f.name}: ${errMsg(e)}`);
      break;
    }
  }
  opts.onDone?.(ok);
  if (!ok || !firstPath) return;
  const folder = firstPath.replace(/[/\\][^/\\]+$/, '');
  await st.openFolder(folder, 'cv');
}

/**
 * Публичный API: выбрать папку съёмки.
 * Возвращает Promise — редуцируется к загрузке/открытию сессии.
 */
export function pickFolder(opts: PickOptions = {}): Promise<void> {
  const st = useSession.getState();
  if (!st.online) {
    if (st.engineState === 'starting') {
      st.toast('info', 'Запуск движка…', 'Подождите пару секунд, движок запускается');
      const start = Date.now();
      const waitOnline = async (): Promise<boolean> => {
        while (Date.now() - start < 8000) {
          await new Promise((r) => setTimeout(r, 250));
          if (useSession.getState().online) return true;
        }
        return false;
      };
      return waitOnline().then((ok) => {
        if (ok) return pickFolder(opts);
        useSession.getState().toast('warn', 'Движок не отвечает', 'Попробуйте ещё раз');
        opts.onDone?.(false);
      });
    }
    st.toast('warn', 'Движок не отвечает', 'Выбор папки недоступен — проверьте статус движка');
    Promise.resolve().then(() => opts.onDone?.(false));
    return Promise.resolve();
  }
  return (async () => {
    try {
      if (sc.isTauri()) {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const dir = await open({ directory: true, multiple: false, title: 'Папка с RAW-файлами съёмки' });
        if (typeof dir === 'string' && dir) {
          void st.openFolder(dir, 'cv');
        }
        opts.onDone?.(typeof dir === 'string');
        return;
      }
    } catch {
      /* не Tauri — браузерный путь ниже */
    }
    await pickFolderBrowser(opts);
  })();
}
