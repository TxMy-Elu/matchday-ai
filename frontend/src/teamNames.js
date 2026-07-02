// French display names for the 48 2026 World Cup teams (and the few host
// countries referenced as fixture venues). Keys are the canonical English
// names used everywhere else (API payloads, flags.js, React state/keys) —
// only the rendered label changes with language.
export const FR_TEAM_NAMES = {
  "Algeria": "Algérie",
  "Argentina": "Argentine",
  "Australia": "Australie",
  "Austria": "Autriche",
  "Belgium": "Belgique",
  "Bosnia and Herzegovina": "Bosnie-Herzégovine",
  "Brazil": "Brésil",
  "Canada": "Canada",
  "Cape Verde": "Cap-Vert",
  "Colombia": "Colombie",
  "Croatia": "Croatie",
  "Curaçao": "Curaçao",
  "Czech Republic": "République tchèque",
  "DR Congo": "RD Congo",
  "Ecuador": "Équateur",
  "Egypt": "Égypte",
  "England": "Angleterre",
  "France": "France",
  "Germany": "Allemagne",
  "Ghana": "Ghana",
  "Haiti": "Haïti",
  "Iran": "Iran",
  "Iraq": "Irak",
  "Ivory Coast": "Côte d'Ivoire",
  "Japan": "Japon",
  "Jordan": "Jordanie",
  "Mexico": "Mexique",
  "Morocco": "Maroc",
  "Netherlands": "Pays-Bas",
  "New Zealand": "Nouvelle-Zélande",
  "Norway": "Norvège",
  "Panama": "Panama",
  "Paraguay": "Paraguay",
  "Portugal": "Portugal",
  "Qatar": "Qatar",
  "Saudi Arabia": "Arabie saoudite",
  "Scotland": "Écosse",
  "Senegal": "Sénégal",
  "South Africa": "Afrique du Sud",
  "South Korea": "Corée du Sud",
  "Spain": "Espagne",
  "Sweden": "Suède",
  "Switzerland": "Suisse",
  "Tunisia": "Tunisie",
  "Turkey": "Turquie",
  "United States": "États-Unis",
  "Uruguay": "Uruguay",
  "Uzbekistan": "Ouzbékistan",
}

export function teamName(name, lang) {
  if (lang === 'fr') return FR_TEAM_NAMES[name] || name
  return name
}
