import { useEffect, useRef, useState } from 'react';
import { CircleHelp, MoreVertical, Settings, Info } from 'lucide-react';
import { useSession } from '../store/useSession';
import { cx } from '../lib/cx';

/**
 * BUG-007: кнопка «⋮» в шапке — настоящее выпадающее меню
 * (Справка · Настройки · О приложении), а не статичный тост.
 */
export default function AppMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const setModal = useSession((s) => s.setModal);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item =
    'w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-tx-2 hover:bg-surface-hover hover:text-tx-1 transition-colors text-left';

  const act = (m: 'help' | 'settings' | 'about') => {
    setOpen(false);
    setModal(m, true);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        className={cx(
          'w-[30px] h-[30px] rounded-md grid place-items-center transition-colors',
          open ? 'bg-elevated text-tx-1' : 'text-tx-2 hover:bg-elevated hover:text-tx-1',
        )}
        title="Меню — справка и настройки"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[36px] z-[90] w-[220px] bg-[#1C1E26] border border-white/15 rounded-pop shadow-lift py-1.5 flex flex-col"
        >
          <button role="menuitem" className={item} onClick={() => act('help')}>
            <CircleHelp size={15} className="text-accent-text" />
            Справка
          </button>
          <button role="menuitem" className={item} onClick={() => act('settings')}>
            <Settings size={15} className="text-accent-text" />
            Настройки
          </button>
          <div className="h-px bg-white/8 my-1" />
          <button role="menuitem" className={item} onClick={() => act('about')}>
            <Info size={15} className="text-accent-text" />
            О приложении
          </button>
        </div>
      )}
    </div>
  );
}
