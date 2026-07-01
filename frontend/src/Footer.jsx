import Logo from './Logo.jsx'
import { useLang } from './i18n.jsx'

const LEGAL_LINKS = [
  { href: '#/legal/mentions-legales', key: 'legal_mentions' },
  { href: '#/legal/confidentialite', key: 'legal_privacy' },
  { href: '#/legal/cgu', key: 'legal_terms' },
]

export default function Footer() {
  const { t, lang } = useLang()
  const year = new Date().getFullYear()

  return (
    <footer className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-10 sm:py-12 border-t border-line mt-6">
      <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-8 sm:gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-3">
            <Logo className="w-7 h-7 shrink-0" />
            <span className="font-display text-lg font-bold gradient-text">Matchday AI</span>
          </div>
          <p className="text-xs text-mist-500 leading-relaxed max-w-md">{t('footer_disclaimer')}</p>
        </div>

        <div>
          <div className="kicker text-[11px] text-mist-500 font-semibold mb-3">{t('footer_legal')}</div>
          <ul className="space-y-2">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-sm text-mist-300 hover:text-mist-50 transition">
                  {t(l.key)}
                  {lang === 'en' && t('footer_legal_lang_note') && (
                    <span className="text-mist-700 text-[11px]"> {t('footer_legal_lang_note')}</span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-mist-700 font-mono">
        <span>{t('footer_rights', { year })}</span>
        <span>{t('footer_hosted')}</span>
      </div>
    </footer>
  )
}
