/**
 * Логотип приложения RAW Renamer Studio:
 * Неоновая буква «R» в виде штрихкода со светящимся лазерным лучом сканера.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0 select-none"
    >
      <defs>
        {/* Фон: глубокий темно-синий/индиго градиент */}
        <linearGradient id="rrs-bg" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#121324" />
          <stop offset="1" stopColor="#0B0C16" />
        </linearGradient>

        {/* Неоновый градиент для штрихов буквы R (фиолетовый -> синий циан) */}
        <linearGradient id="rrs-bars" x1="12" y1="8" x2="34" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C084FC" />
          <stop offset="0.5" stopColor="#818CF8" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>

        {/* Лазерный луч: оранжево-желтое свечение */}
        <linearGradient id="rrs-laser" x1="4" y1="22" x2="40" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF4500" stopOpacity="0" />
          <stop offset="0.2" stopColor="#FF5722" stopOpacity="0.8" />
          <stop offset="0.5" stopColor="#FFEB3B" stopOpacity="1" />
          <stop offset="0.8" stopColor="#FF5722" stopOpacity="0.8" />
          <stop offset="1" stopColor="#FF4500" stopOpacity="0" />
        </linearGradient>

        {/* Мягкое лазерное свечение */}
        <filter id="rrs-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Форма иконки (squircle) с тонкой неоновой каймой */}
      <rect x="1.5" y="1.5" width="41" height="41" rx="10" fill="url(#rrs-bg)" stroke="#312E81" strokeWidth="1" />

      {/* Штрихкод: вертикальные полосы, формирующие букву «R» */}
      <g fill="url(#rrs-bars)">
        {/* Левая вертикальная стойка буквы R */}
        <rect x="12" y="10" width="1.8" height="24" rx="0.9" />
        <rect x="14.6" y="10" width="1.2" height="24" rx="0.6" />
        <rect x="16.5" y="10" width="2.2" height="24" rx="1.1" />

        {/* Верхняя петля буквы R */}
        <rect x="19.5" y="10" width="1.4" height="4.5" rx="0.7" />
        <rect x="21.7" y="10" width="2" height="4.5" rx="1" />
        <rect x="24.4" y="10.5" width="1.5" height="5" rx="0.7" />
        <rect x="26.6" y="11.5" width="2" height="6.5" rx="1" />
        <rect x="29.2" y="13" width="1.8" height="6.5" rx="0.9" />
        <rect x="27" y="19" width="2.2" height="4" rx="1" />
        <rect x="24" y="19" width="1.8" height="4" rx="0.9" />
        <rect x="21" y="19" width="2.2" height="4" rx="1" />
        <rect x="19.5" y="19" width="1.2" height="4" rx="0.6" />

        {/* Правая диагональная ножка буквы R */}
        <rect x="20.5" y="24" width="1.6" height="5" rx="0.8" />
        <rect x="22.8" y="25" width="2" height="6.5" rx="1" />
        <rect x="25.4" y="26" width="1.6" height="7" rx="0.8" />
        <rect x="27.6" y="27" width="2.2" height="7" rx="1.1" />
        <rect x="30.3" y="28" width="1.8" height="6" rx="0.9" />
      </g>

      {/* Горизонтальный лазерный луч сканера через букву R */}
      {/* 1. Широкое мягкое свечение лазера */}
      <line x1="3" y1="21.5" x2="41" y2="21.5" stroke="#FF5722" strokeWidth="3" opacity="0.4" filter="url(#rrs-glow)" />
      {/* 2. Основная яркая линия лазера */}
      <line x1="4" y1="21.5" x2="40" y2="21.5" stroke="url(#rrs-laser)" strokeWidth="1.2" />
      {/* 3. Горячее белое ядро лазера в центре перекрестия */}
      <line x1="10" y1="21.5" x2="34" y2="21.5" stroke="#FFFFFF" strokeWidth="0.6" opacity="0.9" />

      {/* Вспышки света (flare sparks) на левом и правом краях буквы R */}
      <circle cx="12.5" cy="21.5" r="2.2" fill="#FFA726" opacity="0.8" filter="url(#rrs-glow)" />
      <circle cx="12.5" cy="21.5" r="1" fill="#FFFFFF" />
      <circle cx="28" cy="21.5" r="2.2" fill="#FFA726" opacity="0.8" filter="url(#rrs-glow)" />
      <circle cx="28" cy="21.5" r="1" fill="#FFFFFF" />
    </svg>
  );
}

export default Logo;
