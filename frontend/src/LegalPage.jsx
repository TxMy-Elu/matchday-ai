import Logo from './Logo.jsx'
import Footer from './Footer.jsx'
import { useLang } from './i18n.jsx'

function H2({ children }) {
  return <h2 className="font-display text-xl font-semibold text-mist-50 mt-10 mb-3 first:mt-0">{children}</h2>
}
function P({ children }) {
  return <p className="text-sm text-mist-300 leading-relaxed mb-3">{children}</p>
}
function Ul({ children }) {
  return <ul className="list-disc pl-5 space-y-1.5 text-sm text-mist-300 leading-relaxed mb-3">{children}</ul>
}
function MentionsLegales() {
  return (
    <>
      <H2>Éditeur du site</H2>
      <P>
        Le site Matchday AI (<a className="underline hover:text-mist-50" href="https://matchday-ai.app">matchday-ai.app</a>) est édité, à titre non professionnel, par Tom Doguet.
      </P>
      <P>
        Conformément à l'article 6-III-2 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie
        numérique (LCEN), applicable aux personnes physiques n'agissant pas à titre professionnel, l'adresse
        postale de l'éditeur n'est pas rendue publique. Elle est tenue à la disposition des autorités judiciaires
        qui en feraient la demande, via l'hébergeur du site.
      </P>
      <P>
        Contact : <a className="underline hover:text-mist-50" href="mailto:to.doguet@gmail.com">to.doguet@gmail.com</a>
      </P>
      <P>Directeur de la publication : Tom Doguet.</P>

      <H2>Hébergement</H2>
      <P>
        Le site (partie applicative front-end et API) est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut,
        CA 91789, États-Unis — <a className="underline hover:text-mist-50" href="https://vercel.com">vercel.com</a>.
      </P>

      <H2>Propriété intellectuelle</H2>
      <P>
        L'ensemble des éléments du site (code, textes, logo, charte graphique) est protégé au titre du droit
        d'auteur et reste la propriété de l'éditeur, sauf mention contraire. Les données de matchs et résultats
        historiques utilisées par le modèle proviennent de sources publiques.
      </P>

      <H2>Nature du service et responsabilité</H2>
      <P>
        Matchday AI fournit des estimations statistiques (probabilités, scores probables) générées par un modèle
        prédictif. Ces estimations sont fournies à titre purement informatif et de divertissement, ne constituent
        en aucun cas un conseil de paris sportifs et ne garantissent pas l'issue réelle des matchs. L'éditeur ne
        saurait être tenu responsable des décisions prises sur la base de ces informations, notamment financières.
      </P>

      <H2>Liens hypertextes</H2>
      <P>
        Le site peut contenir des liens vers des sites tiers. L'éditeur n'exerce aucun contrôle sur ces sites et
        décline toute responsabilité quant à leur contenu.
      </P>

      <H2>Droit applicable</H2>
      <P>Les présentes mentions légales sont soumises au droit français. En cas de litige, les tribunaux français seront seuls compétents.</P>
    </>
  )
}

function Confidentialite() {
  return (
    <>
      <H2>Responsable du traitement</H2>
      <P>
        Tom Doguet, contact :{' '}
        <a className="underline hover:text-mist-50" href="mailto:to.doguet@gmail.com">to.doguet@gmail.com</a>
      </P>

      <H2>Données collectées</H2>
      <P>
        Matchday AI ne demande aucune inscription ni compte utilisateur : aucune donnée d'identification
        (nom, email, mot de passe) n'est collectée pour utiliser le service. Le site utilise les équipes et
        matchs choisis par l'utilisateur uniquement pour générer une prédiction, sans les enregistrer côté serveur.
      </P>
      <Ul>
        <li>
          <strong className="text-mist-50">Mesure d'audience et de performance</strong> : Vercel Web Analytics et
          Vercel Speed Insights, conçus pour fonctionner sans identifiant permettant de suivre un visiteur d'un
          site à l'autre.
        </li>
        <li>
          <strong className="text-mist-50">Données techniques standard</strong> : adresse IP et informations de
          requête traitées de façon automatique par l'hébergeur (Vercel) dans le cadre du fonctionnement technique
          du site.
        </li>
      </Ul>

      <H2>Finalités et base légale</H2>
      <P>
        Ces traitements ont pour finalité le bon fonctionnement du service ainsi que la mesure d'audience et
        l'amélioration des performances techniques. Ils reposent sur l'intérêt légitime de l'éditeur à faire
        fonctionner et améliorer le site (article 6.1.f du RGPD).
      </P>

      <H2>Cookies</H2>
      <P>
        Le site n'utilise pas de cookies publicitaires ni de traceurs nécessitant un consentement préalable au
        sens de la recommandation de la CNIL sur les cookies et autres traceurs. Si cela venait à changer, un
        bandeau de consentement serait mis en place avant tout dépôt de cookie non essentiel.
      </P>

      <H2>Destinataires et transferts de données</H2>
      <P>
        Les données techniques mentionnées ci-dessus sont traitées par l'hébergeur Vercel Inc. (États-Unis). Un
        transfert hors Union européenne est susceptible d'intervenir dans ce cadre ; il est encadré par les
        garanties prévues par Vercel pour se conformer au RGPD (clauses contractuelles types).
      </P>

      <H2>Durée de conservation</H2>
      <P>
        Aucune donnée personnelle identifiable n'est conservée par l'éditeur. Les données d'audience agrégées sont
        conservées selon la politique de rétention par défaut de Vercel.
      </P>

      <H2>Vos droits</H2>
      <P>
        Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation et
        d'opposition concernant vos données. Vous pouvez exercer ces droits en écrivant à{' '}
        <a className="underline hover:text-mist-50" href="mailto:to.doguet@gmail.com">to.doguet@gmail.com</a>.
        Vous disposez également du droit d'introduire une réclamation auprès de la CNIL (
        <a className="underline hover:text-mist-50" href="https://www.cnil.fr">cnil.fr</a>).
      </P>
    </>
  )
}

function CGU() {
  return (
    <>
      <H2>Objet</H2>
      <P>
        Matchday AI est un outil gratuit de pronostics football basé sur un modèle statistique (notation Elo
        combinée à un modèle de buts de Poisson corrigé Dixon-Coles), proposé à titre informatif et de
        divertissement pour la Coupe du Monde 2026. Les présentes conditions générales d'utilisation régissent
        l'accès et l'usage du site par tout visiteur.
      </P>

      <H2>Accès au service</H2>
      <P>
        Le service est accessible gratuitement, sans inscription, à tout utilisateur disposant d'un accès à
        internet. L'éditeur s'efforce d'assurer la disponibilité du site mais ne garantit pas un accès continu ou
        sans erreur, et se réserve le droit d'interrompre ou de modifier le service à tout moment, sans préavis.
      </P>

      <H2>Nature des prédictions</H2>
      <P>
        Les probabilités, scores prédits et cotes de championnat affichés sont des estimations statistiques
        issues d'un modèle entraîné sur des données historiques. Elles ne constituent ni une garantie de résultat,
        ni un conseil de paris sportifs. L'utilisateur reste seul responsable de l'usage qu'il fait de ces
        informations, y compris à des fins de pari, et l'éditeur décline toute responsabilité en cas de perte
        financière en résultant.
      </P>

      <H2>Propriété intellectuelle</H2>
      <P>
        Le code, le design, la marque « Matchday AI » et les contenus du site sont protégés par le droit de la
        propriété intellectuelle. Toute reproduction ou réutilisation non autorisée est interdite.
      </P>

      <H2>Modification des CGU</H2>
      <P>
        L'éditeur se réserve le droit de modifier les présentes conditions à tout moment. Les utilisateurs sont
        invités à les consulter régulièrement.
      </P>

      <H2>Droit applicable et litiges</H2>
      <P>
        Les présentes conditions sont soumises au droit français. À défaut de résolution amiable, tout litige
        relève de la compétence des tribunaux français.
      </P>
    </>
  )
}

const PAGES = {
  'mentions-legales': { title: 'Mentions légales', Content: MentionsLegales },
  confidentialite: { title: 'Politique de confidentialité', Content: Confidentialite },
  cgu: { title: "Conditions générales d'utilisation", Content: CGU },
}

export default function LegalPage({ page }) {
  const { t } = useLang()
  const entry = PAGES[page] || PAGES['mentions-legales']
  const { title, Content } = entry

  return (
    <div className="min-h-screen font-body flex flex-col">
      <header className="sticky top-0 z-30 glass">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-4 sm:py-5 flex items-center justify-between">
          <a href="#/" className="flex items-center gap-2.5 min-w-0">
            <Logo className="w-8 h-8 shrink-0" />
            <span className="font-display text-lg sm:text-xl font-bold gradient-text truncate">Matchday AI</span>
          </a>
          <a href="#/" className="text-xs sm:text-sm text-mist-300 hover:text-mist-50 transition shrink-0">
            {t('back_home')}
          </a>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-10 sm:py-14 flex-1 w-full">
        <div className="glass rounded-2xl p-5 sm:p-8 lg:p-12 max-w-3xl">
          <div className="kicker text-[11px] text-mist-500 mb-2">{t('legal_info_kicker')}</div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-mist-50 mb-8">{title}</h1>
          <p className="text-xs text-mist-700 italic mb-8">
            Ce document est fourni uniquement en français, conformément à la réglementation applicable.
          </p>
          <Content />
        </div>
      </main>

      <Footer />
    </div>
  )
}
