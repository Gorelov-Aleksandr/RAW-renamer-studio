import { useSession } from '../store/useSession';

export default function Lightbox() {
  const lb = useSession((s) => s.lightbox);
  const setLightbox = useSession((s) => s.setLightbox);

  if (!lb) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-[5px] flex items-center justify-center"
      onClick={() => setLightbox(null)}
    >
      <img
        src={lb.src}
        alt=""
        className="max-w-[78%] max-h-[78%] rounded-xl border border-white/10 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[12px] text-tx-2 bg-black/60 px-3 py-1.5 rounded-lg whitespace-nowrap">
        {lb.cap}
      </div>
      <button
        onClick={() => setLightbox(null)}
        className="absolute top-4 right-4 w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center text-white"
        title="Закрыть (Esc)"
      >
        ✕
      </button>
    </div>
  );
}
