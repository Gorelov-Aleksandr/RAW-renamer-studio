import { Component, useEffect, type ReactNode } from 'react';
import { useSession, errMsg } from './store/useSession';
import * as sc from './lib/sidecar';
import { log, logError } from './lib/logger';
import { pickFolder } from './lib/pickFolder';
import { cx } from './lib/cx';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import VirtualGrid from './components/VirtualGrid';
import RightPanel from './components/RightPanel';
import StatusBar from './components/StatusBar';
import RenameModal from './components/RenameModal';
import BarcodeModal from './components/BarcodeModal';
import ZayavkaModal from './components/ZayavkaModal';
import SettingsModal from './components/SettingsModal';
import HelpModal from './components/HelpModal';
import AboutModal from './components/AboutModal';
import CommandPalette from './components/CommandPalette';
import AppMenu from './components/AppMenu';
import Lightbox from './components/Lightbox';
import Toasts from './components/Toasts';
import { Logo } from './components/Logo';

export { Logo };

/**
 * v3.3 (C5): ErrorBoundary — рендер-ошибка не убивает всё приложение.
 * Показываем понятный экран с кнопкой «Перезапустить».
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    logError('render_crash', error);
  }
  private reset = () => {
    this.setState({ error: null });
    window.location.reload();
  };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-base text-tx-1 p-8 text-center">
        <div className="text-[15px] font-semibold">Что-то пошло не так</div>
        <div className="text-[13px] text-tx-2 max-w-md">
          Приложение столкнулось с неожиданным сбоем. Данные партии не пострадали.
        </div>
        <div className="font-mono text-[11px] text-tx-3 max-w-md break-all">
          {this.state.error.message}
        </div>
        <button
          onClick={this.reset}
          className="mt-2 h-9 px-5 rounded-lg bg-accent-fill hover:bg-[#6A57E2] text-white text-[13px] font-bold"
        >
          Перезапустить приложение
        </button>
      </div>
    );
  }
}

export default function App() {
  const init = useSession((s) => s.init);
  const online = useSession((s) => s.online);
  const engineState = useSession((s) => s.engineState);
  const bootStage = useSession((s) => s.bootStage);
  const session = useSession((s) => s.session);
  const info = useSession((s) => s.info);
  const flipMode = useSession((s) => s.flipMode);

  useEffect(() => {
    init();
  }, [init]);

  // v3.3 (L5): drag&drop папки съёмки / заявки прямо на окно приложения.
  // Tauri: событие tauri://drag-drop (WKWebView не отдаёт содержимое папок
  // через DataTransfer — нативное событие даёт реальные пути).
  // Браузер: webkitGetAsEntry (Chromium) / входные файлы.
  useEffect(() => {
    if (!sc.isTauri()) {
      const onDrop = async (e: DragEvent) => {
        if (!e.dataTransfer?.files?.length) return;
        e.preventDefault();
        const st = useSession.getState();
        const files = Array.from(e.dataTransfer.files);
        const xlsx = files.find((f) => /\.(xlsx|xlsm)$/i.test(f.name));
        if (xlsx) {
          log('dnd_zayavka', 'info', { file: xlsx.name });
          try {
            // браузер не знает путей — загружаем файл в sidecar и открываем копию
            const up = await sc.uploadFile(xlsx);
            await st.loadZayavka(up.path);
          } catch (e) {
            st.toast('err', 'Не удалось загрузить заявку', errMsg(e));
          }
          return;
        }
        const raw = files.filter((f) => /\.(cr2|cr3|arw|nef|orf|rw2|dng|raf|nrw|pef|x3f)$/i.test(f.name));
        if (raw.length === 0) {
          st.toast('info', 'Нет RAW-файлов', 'Перетащите папку со съёмкой или файл .xlsx заявки');
        } else {
          st.toast('info', 'Перетащите папку целиком', 'Отдельные RAW-файлы не образуют партию — нужна папка съёмки');
        }
      };
      window.addEventListener('drop', onDrop);
      const onOver = (e: DragEvent) => e.preventDefault();
      window.addEventListener('dragover', onOver);
      return () => {
        window.removeEventListener('drop', onDrop);
        window.removeEventListener('dragover', onOver);
      };
    }
    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<{ type: string; paths: string[] }>('tauri://drag-drop', (e) => {
          if (e.payload.type !== 'drop' || !e.payload.paths.length) return;
          void (async () => {
            const st = useSession.getState();
            for (const p of e.payload.paths) {
              if (/\.xlsx?$/i.test(p)) {
                log('dnd_zayavka', 'info', { path: p });
                await st.loadZayavka(p);
                continue;
              }
              try {
                const isDir = await sc.rpc<{ is_dir: boolean }>('fs.is_dir', { path: p });
                if (isDir.is_dir) {
                  log('dnd_folder', 'info', { path: p });
                  await st.openFolder(p, 'cv');
                  return;
                }
              } catch {
                continue;
              }
            }
            st.toast('info', 'Перетащите папку целиком', 'Отдельные RAW-файлы не образуют партию — нужна папка съёмки');
          })();
        });
      } catch {
        /* слушатель не поднимется — DnD просто недоступен */
      }
    })();
    return () => unlisten?.();
  }, []);

  // v3.3 (D3): события нативного меню macOS (menu://*) → те же действия, что и кнопки.
  useEffect(() => {
    if (!sc.isTauri()) return;
    const un: (() => void)[] = [];
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        un.push(await listen('menu://open', () => void pickFolder()));
        un.push(
          await listen('menu://settings', () => useSession.getState().setModal('settings', true)),
        );
        un.push(await listen('menu://undo', () => void useSession.getState().undoLast()));
        un.push(await listen('menu://help', () => useSession.getState().setModal('help', true)));
        un.push(
          await listen('menu://about', () => useSession.getState().setModal('about', true)),
        );
      } catch {
        /* меню недоступно — не критично */
      }
    })();
    return () => un.forEach((f) => f());
  }, []);

  // Глобальные горячие клавиши (master §10 / прототип)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useSession.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && ['z', 'Z', 'я', 'Я'].includes(e.key)) {
        e.preventDefault();
        void st.undoLast();
        return;
      }
      if (mod && ['k', 'K', 'л', 'Л'].includes(e.key)) {
        e.preventDefault();
        // BUG-008: настоящая командная палитра (был тост-заглушка)
        st.setModal('palette', !st.modals.palette);
        return;
      }
      // v3.3: ⌘O — открыть папку съёмки (нативный диалог / браузерный picker)
      if (mod && ['o', 'O', 'х', 'Х'].includes(e.key)) {
        e.preventDefault();
        log('hotkey_open');
        void pickFolder();
        return;
      }
      // v3.5: ⌘F — фокус на поиске (код LM / ШК / название среди всех артикулов)
      if (mod && ['f', 'F', 'а', 'А'].includes(e.key)) {
        e.preventDefault();
        const el = document.getElementById('global-search') as HTMLInputElement | null;
        el?.focus();
        el?.select();
        return;
      }
      if (e.key === 'Escape') {
        st.setLightbox(null);
        st.closeModals();
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }
      if (
        !mod &&
        ['r', 'R', 'к', 'К'].includes(e.key) &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        const act =
          st.session?.items.find((i) => i.id === st.activeId && i.status === 'err') ??
          st.session?.items.find((i) => i.status === 'err');
        if (act) {
          st.setActive(act.id);
          st.setModal('barcode', true);
        }
        return;
      }
      if (e.code === 'Space' && !mod && !e.altKey) {
        const el = document.activeElement as HTMLElement | null;
        const card = el?.closest?.('[data-card]');
        if (card) {
          e.preventDefault();
          const id = card.getAttribute('data-card')!;
          const it = st.session?.items.find((x) => x.id === id);
          if (it) {
            const hero = it.frames.find((f) => !f.is_label) ?? it.frames[0];
            if (hero?.preview) {
              st.setLightbox({
                src: sc.previewUrl(hero.preview, 1400),
                cap: `${it.lm_code ?? '—'} · ${hero.name} · быстрый просмотр`,
              });
            }
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const folderName = session?.folder
    ? session.folder.split(/[\\/]/).filter(Boolean).pop() ?? null
    : null;

  return (
    <div className="h-screen flex flex-col bg-base text-tx-1 font-sans text-[13.5px] overflow-hidden">
      <header className="h-11 flex-shrink-0 flex items-center gap-3 bg-panel border-b border-white/5 px-3">
        <Logo />
        <span className="font-semibold text-[13.5px] tracking-[0.01em]">RAW Renamer Studio</span>
        <div className="w-px h-5 bg-white/10" />
        {session ? (
          <div className="flex items-center gap-2 text-xs text-tx-2 bg-surface border border-white/5 rounded-md px-2.5 py-1 min-w-0">
            <span
              title={engineState === 'online' ? 'Движок работает' : engineState === 'starting' ? 'Движок запускается…' : 'Движок не отвечает'}
              className={cx('w-1.5 h-1.5 rounded-full flex-shrink-0', online ? 'bg-ok' : engineState === 'starting' ? 'bg-tx-3' : 'bg-danger')}
            />
            <span className="truncate">
              Партия <b className="font-mono text-tx-1 text-[11.5px]">{folderName}</b>
            </span>
            <button
              onClick={flipMode}
              title="Режим партии: CV-сканер (ШК с фото) / По именам файлов"
              className="text-[10px] font-bold tracking-wider uppercase text-accent-text bg-accent-tint border border-accent/25 px-1.5 py-0.5 rounded-full hover:bg-accent/20 transition-colors flex-shrink-0"
            >
              {session.mode === 'cv' ? 'CV-сканер' : 'По именам'}
            </button>
          </div>
        ) : (
          <span className="text-xs text-tx-3">Партия не открыта</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {engineState === 'online' && (
            <button
              onClick={() => useSession.getState().setModal('about', true)}
              title={info ? `Всё работает · движок v${info.version}` : 'Всё работает'}
              className="text-[10px] font-semibold tracking-wide text-ok/80 bg-ok/10 border border-ok/20 rounded px-1.5 py-0.5 hover:bg-ok/15 transition-colors"
            >
              онлайн
            </button>
          )}
          {engineState === 'starting' && (
            <span
              title="Запуск Python-движка: распаковка → загрузка → сервер. Обычно 3–10 секунд, ничего делать не надо."
              className="flex items-center gap-2 h-[26px] px-2.5 rounded-lg bg-white/5 border border-white/10"
            >
              <span className="spinner" aria-hidden="true" />
              <span className="text-[10px] font-semibold tracking-wide text-tx-2">Запуск движка…</span>
              <span className="flex items-center gap-[3px]" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={cx('w-[14px] h-[3px] rounded-full transition-colors duration-300',
                    i <= bootStage ? 'bg-accent' : 'bg-white/10')} />
                ))}
              </span>
            </span>
          )}
          {engineState === 'offline' && (
            <span
              title="Приложение не может связаться с Python-движком. Закройте и откройте приложение заново."
              className="text-[10px] font-semibold tracking-wide text-danger bg-danger/15 border border-danger/30 rounded px-1.5 py-0.5"
            >
              движок не отвечает
            </span>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 h-[26px] px-2.5 rounded-lg font-mono text-[11px] text-tx-3 bg-white/5 border border-white/10">
            <kbd className="text-[10.5px] text-tx-2 bg-white/5 border border-white/10 border-b-2 rounded px-1">⌘</kbd>
            K
          </span>
          {/* BUG-007: выпадающее меню (был тост-заглушка) */}
          <AppMenu />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <Toolbar />
          <VirtualGrid />
        </main>
        <RightPanel />
      </div>

      <StatusBar />
      <RenameModal />
      <BarcodeModal />
      <ZayavkaModal />
      <SettingsModal />
      <HelpModal />
      <AboutModal />
      <CommandPalette />
      <Lightbox />
      <Toasts />
    </div>
  );
}
