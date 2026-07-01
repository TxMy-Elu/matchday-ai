import { useLang } from './i18n.jsx'

function IconGlobe({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5S9.6 5.8 12 3.5Z" />
    </svg>
  )
}

export default function LanguageToggle({ className = '' }) {
  const { lang, setLang } = useLang()
  const next = lang === 'en' ? 'fr' : 'en'

  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      title={lang === 'en' ? 'Passer en français' : 'Switch to English'}
      className={`flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1.5 text-[11px] font-mono font-semibold text-mist-300 hover:text-mist-50 hover:border-emerald-400/60 transition ${className}`}
    >
      <IconGlobe className="w-3.5 h-3.5 shrink-0" />
      {lang.toUpperCase()}
    </button>
  )
}
