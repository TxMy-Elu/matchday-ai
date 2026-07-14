import { createContext, useContext, useEffect, useState } from 'react'
import { teamName } from './teamNames.js'

const STRINGS = {
  en: {
    tagline: '2026 World Cup Predictor',
    stats_line1: '{n} teams · Elo + Dixon-Coles Poisson',
    stats_line2: 'trained on 49,481 matches, 1872–2026',
    tab_predictor: 'Match Predictor',
    tab_bracket: 'Tournament Simulator',
    tab_results: 'Results & Bracket',

    hero_desc: 'Pick two national teams to generate a win / draw / loss forecast and predicted scoreline.',
    label_home: 'Home',
    label_away: 'Away',
    neutral_venue: 'Neutral venue',
    neutral_hint: '(on for almost every 2026 knockout match)',
    fixtures_heading: 'Or jump to a scheduled fixture',
    host_badge: 'host',
    projected_hint: 'matchup set, date TBD',
    penalty_card_title: 'Penalty Shootout',
    penalty_card_desc: "If the match is level after extra time, here's who the model favours on penalties.",
    penalty_win_label: '{team} win on penalties',
    error_backend: 'Could not reach the Matchday AI backend. Is it running on :8000?',
    error_predict: 'Prediction failed. Please try again.',

    scoreline_label: 'Predicted Scoreline',
    scoreline_meta: 'Most likely exact scoreline · {pct} probability · xG {home} – {away}',
    match_outcome: 'Match Outcome',
    win_label: '{team} win',
    draw_label: 'Draw',
    elo_rating: 'Elo rating',
    recent_form: 'Recent form (last 10)',
    odds_board: 'Odds Board',
    loading_model: 'Running the model…',
    select_prompt: 'Select both teams above to see a prediction.',

    select_team: 'Select a team…',
    search_teams: 'Search teams…',
    no_teams_match: 'No teams match “{query}”',

    running_sims: 'Running 20,000 simulated tournaments…',
    championship_odds: 'Championship Odds',
    sims_desc: '{n} simulated knockout tournaments, from the current {round} onward.',
    rerun: 'Re-run ↻',
    simulating: 'Simulating…',
    finale_pct: 'finale {pct}',
    round_remaining: '{round} — Remaining',
    round_fixtures_desc: 'Direct model predictions for each scheduled fixture still to be played.',
    round_done: 'Every knockout fixture played so far has been decided — check back once the next round is scheduled.',

    loading_results: 'Loading results…',
    error_results: 'Could not load results. Is the backend running on :8000?',
    knockout_bracket: 'Knockout Bracket',
    knockout_desc:
      'The full tree toward the final. "TBD" slots follow the official bracket order — the pairing itself is fixed, only the teams (and scores) fill in once each round is actually played.',
    biggest_upsets: 'Biggest Upsets',
    upsets_desc: 'Matches where the lower-Elo team won outright, ranked by how big the pre-match Elo gap was.',
    beat: 'beat',
    group_standings: 'Group Standings',
    standings_desc:
      "Points, then goal difference, then goals scored. Doesn't apply FIFA's full tiebreaker rules (head-to-head, fair play) — good enough to see who's through, not a guarantee of the official order in a genuine tiebreak.",
    col_team: 'Team',
    col_played: 'P',
    col_gd: 'GD',
    col_pts: 'Pts',
    group_label: 'Group {letter}',
    all_results: 'All Results',
    all_results_desc: 'Every 2026 World Cup match, group stage through the final.',
    played_count: '{played}/{total} played',
    tbd: 'TBD',
    upcoming: 'upcoming',
    round_group: 'Group Stage',
    round_r32: 'Round of 32',
    round_r16: 'Round of 16',
    round_qf: 'Quarterfinals',
    round_sf: 'Semifinals',
    round_tp: 'Third-Place Match',
    round_f: 'Final',
    score_col: 'Score',

    footer_disclaimer:
      'Matchday AI predicts outcomes from historical results using a time-weighted Elo rating system and a Dixon-Coles-corrected Poisson goals model. Predictions are probabilistic estimates for entertainment and analysis, not a guarantee of results or betting advice.',
    footer_legal: 'Legal',
    legal_mentions: 'Legal notice',
    legal_privacy: 'Privacy policy',
    legal_terms: 'Terms of use',
    footer_rights: '© {year} Matchday AI. All rights reserved.',
    footer_hosted: 'Hosted by Vercel',
    footer_legal_lang_note: '(available in French)',

    back_home: '← Back to home',
    legal_info_kicker: 'Legal information',
  },
  fr: {
    tagline: 'Pronostiqueur Coupe du Monde 2026',
    stats_line1: '{n} équipes · Elo + Poisson Dixon-Coles',
    stats_line2: 'entraîné sur 49 481 matchs, 1872–2026',
    tab_predictor: 'Pronostiqueur',
    tab_bracket: 'Simulateur de tournoi',
    tab_results: 'Résultats & Tableau',

    hero_desc:
      'Choisis deux équipes nationales pour obtenir un pronostic victoire / nul / défaite et un score probable.',
    label_home: 'Domicile',
    label_away: 'Extérieur',
    neutral_venue: 'Terrain neutre',
    neutral_hint: '(activé pour quasiment tous les matchs à élimination de 2026)',
    fixtures_heading: 'Ou choisis un match programmé',
    host_badge: 'hôte',
    projected_hint: 'affiche fixée, date à venir',
    penalty_card_title: 'Tirs au but',
    penalty_card_desc: 'Si le match est à égalité après prolongation, voici qui le modèle favorise aux tirs au but.',
    penalty_win_label: '{team} gagne aux tirs au but',
    error_backend: 'Impossible de joindre le serveur Matchday AI. Tourne-t-il bien sur le port :8000 ?',
    error_predict: 'Le pronostic a échoué. Merci de réessayer.',

    scoreline_label: 'Score prédit',
    scoreline_meta: 'Score exact le plus probable · {pct} de probabilité · xG {home} – {away}',
    match_outcome: 'Résultat du match',
    win_label: 'Victoire {team}',
    draw_label: 'Match nul',
    elo_rating: 'Classement Elo',
    recent_form: 'Forme récente (10 derniers matchs)',
    odds_board: 'Tableau des scores',
    loading_model: 'Calcul du modèle…',
    select_prompt: 'Sélectionne les deux équipes ci-dessus pour voir un pronostic.',

    select_team: 'Choisir une équipe…',
    search_teams: 'Rechercher une équipe…',
    no_teams_match: 'Aucune équipe ne correspond à « {query} »',

    running_sims: 'Simulation de 20 000 tournois en cours…',
    championship_odds: 'Cotes du titre',
    sims_desc: '{n} tournois à élimination simulés, à partir des {round} actuels.',
    rerun: 'Relancer ↻',
    simulating: 'Simulation…',
    finale_pct: 'finale {pct}',
    round_remaining: '{round} — Restants',
    round_fixtures_desc: 'Prédictions directes du modèle pour chaque match programmé restant à jouer.',
    round_done: 'Tous les matchs à élimination joués jusqu\'ici ont été décidés — reviens une fois le prochain tour programmé.',

    loading_results: 'Chargement des résultats…',
    error_results: 'Impossible de charger les résultats. Le serveur tourne-t-il sur le port :8000 ?',
    knockout_bracket: 'Tableau à élimination',
    knockout_desc:
      'L\'arbre complet jusqu\'à la finale. Les cases « À déterminer » suivent l\'ordre officiel du tableau — l\'appariement est fixé, seules les équipes (et les scores) se complètent au fil des matchs joués.',
    biggest_upsets: 'Plus grosses surprises',
    upsets_desc:
      "Matchs où l'équipe avec le plus faible Elo l'a emporté, classés selon l'écart d'Elo avant match.",
    beat: 'a battu',
    group_standings: 'Classement des groupes',
    standings_desc:
      "Points, puis différence de buts, puis buts marqués. N'applique pas l'intégralité des règles de départage FIFA (confrontations directes, fair-play) — suffisant pour voir qui est qualifié, sans garantir l'ordre officiel en cas d'égalité stricte.",
    col_team: 'Équipe',
    col_played: 'J',
    col_gd: 'Diff',
    col_pts: 'Pts',
    group_label: 'Groupe {letter}',
    all_results: 'Tous les résultats',
    all_results_desc: 'Tous les matchs de la Coupe du Monde 2026, de la phase de groupes à la finale.',
    played_count: '{played}/{total} joués',
    tbd: 'À déterminer',
    upcoming: 'à venir',
    round_group: 'Phase de groupes',
    // French football terminology counts by number of matches, not teams
    // remaining, so it's the reverse of the English "Round of N" naming:
    // 32 teams (16 matches) = "16es de finale", 16 teams (8 matches) = "8es de finale".
    round_r32: 'Seizièmes de finale',
    round_r16: 'Huitièmes de finale',
    round_qf: 'Quarts de finale',
    round_sf: 'Demi-finales',
    round_tp: 'Match pour la 3e place',
    round_f: 'Finale',
    score_col: 'Score',

    footer_disclaimer:
      "Matchday AI prédit l'issue des matchs à partir des résultats historiques, à l'aide d'un système de notation Elo pondéré dans le temps et d'un modèle de buts de Poisson corrigé Dixon-Coles. Les prédictions sont des estimations probabilistes à but informatif et de divertissement, elles ne garantissent aucun résultat et ne constituent pas un conseil de paris.",
    footer_legal: 'Légal',
    legal_mentions: 'Mentions légales',
    legal_privacy: 'Politique de confidentialité',
    legal_terms: "Conditions d'utilisation",
    footer_rights: '© {year} Matchday AI. Tous droits réservés.',
    footer_hosted: 'Hébergé par Vercel',
    footer_legal_lang_note: '',

    back_home: "← Retour à l'accueil",
    legal_info_kicker: 'Informations légales',
  },
}

const LanguageContext = createContext(null)

function detectDefaultLang() {
  if (typeof window === 'undefined') return 'en'
  const saved = window.localStorage.getItem('matchday-lang')
  if (saved === 'en' || saved === 'fr') return saved
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(detectDefaultLang)

  useEffect(() => {
    window.localStorage.setItem('matchday-lang', lang)
    document.documentElement.lang = lang
  }, [lang])

  const t = (key, vars) => {
    const raw = STRINGS[lang][key] ?? STRINGS.en[key] ?? key
    if (!vars) return raw
    return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), raw)
  }

  const tTeam = (name) => teamName(name, lang)

  return <LanguageContext.Provider value={{ lang, setLang, t, tTeam }}>{children}</LanguageContext.Provider>
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used within a LanguageProvider')
  return ctx
}
