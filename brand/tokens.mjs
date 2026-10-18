// Source unique des jetons de design Maintix (couleurs, typo, espacements). Génère tokens.css et tokens.json.
export const colors = {
  gaine:   { name: 'Gaine',        hex: '#0b2b2a', role: 'Texte, fonds sombres, logo sur clair' },
  maintix: { name: 'Teal Maintix', hex: '#0f766e', role: 'Couleur principale : actions, liens, navigation' },
  lumiere: { name: 'Lumière',      hex: '#14b8a6', role: 'Dégradés, éléments actifs sur fond sombre' },
  menthe:  { name: 'Menthe',       hex: '#d7efec', role: 'Fonds d’accentuation, états sélectionnés' },
  signal:  { name: 'Signal',       hex: '#f59e0b', role: 'Accent : la flèche du X, repères, mise en avant' },
  signalP: { name: 'Signal profond', hex: '#92400e', role: 'Signal en texte (contraste AA sur clair)' },
  beton50: { name: 'Béton 50',     hex: '#f4f6f7', role: 'Fond d’application' },
  beton100:{ name: 'Béton 100',    hex: '#eef2f3', role: 'Fonds secondaires, champs' },
  beton200:{ name: 'Béton 200',    hex: '#d9e1e2', role: 'Filets, bordures' },
  beton500:{ name: 'Béton 500',    hex: '#5b6b6a', role: 'Texte secondaire' },
  blanc:   { name: 'Blanc',        hex: '#ffffff', role: 'Cartes, texte sur fond de marque' },
}
export const semantic = {
  ok:    { name: 'Validé',        fg: '#166534', bg: '#dcf5e3', fgDark: '#4ade80', bgDark: '#12351f' },
  watch: { name: 'À surveiller',  fg: '#92400e', bg: '#fdecc8', fgDark: '#fbbf24', bgDark: '#3b2c0b' },
  ko:    { name: 'Défaut',        fg: '#b91c1c', bg: '#fde0e0', fgDark: '#f87171', bgDark: '#3d1717' },
}
export const dark = { bg: '#0d1415', surface: '#151f20', surface2: '#1d2a2b', line: '#2a3a3b', text: '#e8f0ef', muted: '#93a7a5', brand: '#2dd4bf', brandInk: '#062a27', brandSoft: '#123a37' }
export const type = {
  family: "'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  scale: [
    { name: 'Display', size: 40, weight: 800, lh: 1.05, track: '-0.03em', use: 'Couvertures, chiffres clés' },
    { name: 'Titre 1', size: 24, weight: 800, lh: 1.2, track: '-0.02em', use: 'Titre d’écran' },
    { name: 'Titre 2', size: 18, weight: 700, lh: 1.25, track: '-0.01em', use: 'Sections, cartes' },
    { name: 'Corps',   size: 16, weight: 400, lh: 1.45, track: '0', use: 'Texte courant (minimum mobile)' },
    { name: 'Légende', size: 13.6, weight: 500, lh: 1.4, track: '0', use: 'Aides, métadonnées' },
  ],
}
export const space = { unit: 4, steps: [4, 8, 12, 16, 24, 32, 48], radius: { s: 10, m: 14, l: 20, pill: 999 }, tap: 56 }

/* ---------- accessibilité : rapports de contraste WCAG calculés ---------- */
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
export const grade = (r, large = false) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 && large ? 'AA (grand texte)' : r >= 3 ? 'Graphique' : 'Non conforme')

export const pairs = [
  ['Gaine sur Béton 50', colors.gaine.hex, colors.beton50.hex],
  ['Gaine sur Blanc', colors.gaine.hex, colors.blanc.hex],
  ['Teal Maintix sur Blanc', colors.maintix.hex, colors.blanc.hex],
  ['Blanc sur Teal Maintix', colors.blanc.hex, colors.maintix.hex],
  ['Béton 500 sur Béton 50', colors.beton500.hex, colors.beton50.hex],
  ['Signal profond sur Blanc', colors.signalP.hex, colors.blanc.hex],
  ['Signal sur Gaine', colors.signal.hex, colors.gaine.hex],
  ['Signal sur Blanc', colors.signal.hex, colors.blanc.hex],
  ['Blanc sur Gaine', colors.blanc.hex, colors.gaine.hex],
  ['Validé (texte sur fond)', semantic.ok.fg, semantic.ok.bg],
  ['À surveiller (texte sur fond)', semantic.watch.fg, semantic.watch.bg],
  ['Défaut (texte sur fond)', semantic.ko.fg, semantic.ko.bg],
  ['Teal Maintix sur Menthe', '#0b5c55', colors.menthe.hex],
].map(([label, fg, bg]) => ({ label, fg, bg, ratio: contrast(fg, bg) }))

export const cssTokens = () => `/* Jetons de design Maintix — généré par brand/build-assets.mjs, ne pas modifier à la main. */
:root {
  --mx-gaine: ${colors.gaine.hex}; --mx-teal: ${colors.maintix.hex}; --mx-lumiere: ${colors.lumiere.hex}; --mx-menthe: ${colors.menthe.hex};
  --mx-signal: ${colors.signal.hex}; --mx-signal-profond: ${colors.signalP.hex};
  --mx-beton-50: ${colors.beton50.hex}; --mx-beton-100: ${colors.beton100.hex}; --mx-beton-200: ${colors.beton200.hex}; --mx-beton-500: ${colors.beton500.hex};
  --mx-ok: ${semantic.ok.fg}; --mx-ok-bg: ${semantic.ok.bg}; --mx-watch: ${semantic.watch.fg}; --mx-watch-bg: ${semantic.watch.bg}; --mx-ko: ${semantic.ko.fg}; --mx-ko-bg: ${semantic.ko.bg};
  --mx-font: ${type.family}; --mx-mono: ${type.mono};
  --mx-radius-s: ${space.radius.s}px; --mx-radius-m: ${space.radius.m}px; --mx-radius-l: ${space.radius.l}px; --mx-tap: ${space.tap}px;
}
`
