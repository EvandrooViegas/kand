export function KandMark({ size = 40, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="40" height="40" rx="9" fill="currentColor" />
      <path
        d="M12.5 8 L12.5 32 M12.5 20.2 L24.5 8 M13.6 19.6 L24.5 32"
        stroke="#D4FF00"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="31" cy="9.5" r="2.2" fill="#D4FF00" />
    </svg>
  )
}

export function KandLogo({ size = 36, showWord = true }) {
  return (
    <div className="flex items-center gap-2.5 text-foreground">
      <KandMark size={size} />
      {showWord && (
        <span
          className="font-bold tracking-tight leading-none"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: size * 0.85, letterSpacing: '0.02em' }}
        >
          Kand<span style={{ color: '#9AB800' }}>.</span>
        </span>
      )}
    </div>
  )
}
