import { useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import { useSession } from './store/useSession';
import * as sc from './lib/sidecar';
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
import Lightbox from './components/Lightbox';
import Toasts from './components/Toasts';

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
      <defs>
        <linearGradient id="lg-logo" x1="2" y1="2" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8D7EF5" />
          <stop offset="1" stopColor="#F0A24E" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="18" height="18" rx="5.5" fill="url(#lg-logo)" />
      <path d="M7.2 15V7h2.1l3.9 5.2V7h2V15h-2.1L9.2 9.8V15H7.2z" fill="#0D0E12" />
    </svg>
  );
}

export default function App() {
  const init = useSession((s) => s.init);
  const online = useSession((s) => s.online);
  const session = useSession((s) => s.session);
  const info = useSession((s) => s.info);
  const flipMode = useSession((s) => s.flipMode);
  const toast = useSession((s) => s.toast);

  useEffect(() => {
    init();
  }, [init]);

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
        st.toast('info', 'Командная палитра', 'Поиск действий — в полной версии ⌘K');
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
            <span className={cx('w-1.5 h-1.5 rounded-full flex-shrink-0', online ? 'bg-ok' : 'bg-danger')} />
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
          {info && (
            <span className="font-mono text-[10px] text-tx-3 hidden md:inline">sidecar :{info.port}</span>
          )}
          {!online && (
            <span className="text-[10px] font-bold tracking-wider text-danger bg-danger/15 border border-danger/30 rounded px-1.5 py-0.5">
              SIDECAR OFFLINE
            </span>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 h-[26px] px-2.5 rounded-lg font-mono text-[11px] text-tx-3 bg-white/5 border border-white/10">
            <kbd className="text-[10.5px] text-tx-2 bg-white/5 border border-white/10 border-b-2 rounded px-1">⌘</kbd>
            K
          </span>
          <button
            className="w-[30px] h-[30px] rounded-md grid place-items-center text-tx-2 hover:bg-elevated hover:text-tx-1 transition-colors"
            title="Меню — справка и настройки"
            onClick={() => toast('info', 'Меню', 'Справка · Настройки · О приложении')}
          >
            <MoreVertical size={16} />
          </button>
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
      <Lightbox />
      <Toasts />
    </div>
  );
}
