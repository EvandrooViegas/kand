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
      {/* Glassy AI icon - stylized neural network / circuit nodes */}
      <defs>
        <linearGradient id="glassGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.8" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#glassGradient)" opacity="0.1" />
      <circle cx="20" cy="10" r="3.5" fill="currentColor" opacity="0.9" />
      <circle cx="12" cy="24" r="3.5" fill="currentColor" opacity="0.7" />
      <circle cx="28" cy="24" r="3.5" fill="currentColor" opacity="0.7" />
      <circle cx="20" cy="32" r="3.5" fill="currentColor" opacity="0.9" />
      <line x1="20" y1="13.5" x2="20" y2="28.5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <line x1="20" y1="13.5" x2="12" y2="20.5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <line x1="20" y1="13.5" x2="28" y2="20.5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <line x1="12" y1="27.5" x2="20" y2="28.5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <line x1="28" y1="27.5" x2="20" y2="28.5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <rect width="40" height="40" rx="12" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
    </svg>
  )
}

export function KandLogo({ size = 36, showWord = true }) {
  return (
    <div className="flex items-center gap-2.5 text-foreground">
      {showWord && (
        <span
          className="font-bold tracking-tight leading-none"
          style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: size, letterSpacing: '-0.01em', fontWeight: 700 }}
        >
          XAVI<span style={{ color: '#0A84FF', fontWeight: 600 }}>.</span>IA
        </span>
      )}
    </div>
  )
}
