export default function Logo({ className = 'w-9 h-9' }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <defs>
        <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="55%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
        <linearGradient id="logo-sheen" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="16" fill="url(#logo-grad)" />
      <rect x="1" y="1" width="62" height="62" rx="16" fill="url(#logo-sheen)" />
      <path
        d="M16 44V20h5.2l10.8 14.6L42.8 20H48v24h-6.2V29.6l-9.8 13-9.8-13V44H16Z"
        fill="#0A0B12"
      />
    </svg>
  )
}
