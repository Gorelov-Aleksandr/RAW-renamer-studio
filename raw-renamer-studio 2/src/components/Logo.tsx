/** Логотип приложения (общий для шапки, пустых состояний и «О приложении»). */
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

export default Logo;
