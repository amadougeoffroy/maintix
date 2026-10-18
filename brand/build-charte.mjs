// Génère la charte graphique : brand/build-charte.mjs → docs/branding/maintix-charte-graphique.{html,pdf}
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { icons } from 'lucide'
import QRCode from 'qrcode'
import { appIconSvg, stackedSvg, symbolInner, wordmark, wordmarkSvg, xMarkPaths } from './lib.mjs'
import { colors, contrast, dark, grade, pairs, semantic, space, type } from './tokens.mjs'

const dir = fileURLToPath(new URL('.', import.meta.url))
const out = fileURLToPath(new URL('../docs/branding/', import.meta.url))
mkdirSync(out, { recursive: true })

/* ---------- utilitaires ---------- */
const font64 = readFileSync(fileURLToPath(new URL('../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', import.meta.url))).toString('base64')
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const hsl = (h) => {
  const [r, g, b] = rgb(h).map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let hh = 0
  if (d) hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return `${Math.round(((hh * 60) + 360) % 360)}°, ${Math.round(s * 100)} %, ${Math.round(l * 100)} %`
}
const custom = JSON.parse(readFileSync(fileURLToPath(new URL('./icons.json', import.meta.url)), 'utf8'))
const icon = (name, size = 24, color = 'currentColor', sw = 2) => {
  const nodes = custom[name] ?? icons[name]
  if (!nodes) throw new Error(`icône inconnue ${name}`)
  const inner = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
}
const logo = (variant = 'color', width = 240) => {
  const w = wordmark({ variant, size: 100, pad: 2 })
  return `<svg viewBox="${w.viewBox}" width="${width}" height="${(width * w.height) / w.width}" role="img" aria-label="Maintix">${w.inner}</svg>`
}
const tile = (size = 96, bleed = false, id = 'g') => appIconSvg({ bleed, id: `${id}${Math.random().toString(36).slice(2, 6)}` }).replace('<svg ', `<svg width="${size}" height="${size}" `)
const symbol = (variant = 'color', size = 64) => `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-label="Symbole Maintix">${symbolInner({ variant })}</svg>`
const qr = await QRCode.toDataURL('https://maintix.example/#/signal/demo', { margin: 1, width: 360, color: { dark: colors.gaine.hex, light: '#ffffff' } })

let n = 0
const pages = []
const page = (kicker, title, body, cls = '') => {
  n += 1
  pages.push(`<section class="page ${cls}"><header class="ph"><span>${kicker}</span><span>Maintix · Charte graphique</span></header><h2>${title}</h2><div class="pb">${body}</div><footer class="pf"><span>${String(n).padStart(2, '0')}</span></footer></section>`)
}

/* ---------- 01 couverture (page sans en-tête) ---------- */
pages.push(`<section class="page cover"><div class="cv-logo">${logo('dark', 560)}</div><p class="cv-tag">Chaque visite, tracée.</p><div class="cv-meta"><b>Charte graphique</b><span>Version 1.0 · ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span></div><div class="cv-arrows">${symbol('dark', 420)}</div></section>`)
n = 1

/* ---------- 02 essence ---------- */
page('01 · Essence de la marque', 'Pourquoi Maintix existe', `
<div class="cols3">
  <div class="card"><h3>Mission</h3><p>Donner aux entreprises d’ascenseurs un outil qui prouve ce qui a été fait, sur chaque appareil, à chaque visite — en quelques minutes, depuis le téléphone du technicien.</p></div>
  <div class="card"><h3>Promesse</h3><p><b>Chaque visite, tracée.</b> Le technicien finit vite, le responsable voit tout, le client reçoit une preuve claire et signée.</p></div>
  <div class="card"><h3>Positionnement</h3><p>Le logiciel de maintenance <b>spécialiste des ascenseurs</b>, pensé terrain d’abord, pour les PME qui veulent plus de transparence que les grands groupes.</p></div>
</div>
<h3 class="mt">Quatre valeurs</h3>
<div class="cols4">
  <div class="val">${icon('ShieldCheck', 28, colors.maintix.hex)}<b>Fiabilité</b><span>Un outil qui marche hors ligne, au sous-sol, avec des gants.</span></div>
  <div class="val">${icon('Eye', 28, colors.maintix.hex)}<b>Clarté</b><span>Une information lisible en un coup d’œil, sans jargon.</span></div>
  <div class="val">${icon('FileCheck2', 28, colors.maintix.hex)}<b>Preuve</b><span>Rapports horodatés et scellés : on peut s’y fier.</span></div>
  <div class="val">${icon('Wrench', 28, colors.maintix.hex)}<b>Terrain</b><span>Conçu avec ceux qui font le travail, pas pour impressionner.</span></div>
</div>
<p class="mt muted">Personnalité : <b>sobre, précise, rassurante</b> — jamais clinquante. On parle comme un bon chef d’équipe : court, concret, poli.</p>`)

/* ---------- 03 symbole ---------- */
{
  const side = 220, sw = side * 0.29
  const { top, bottom } = xMarkPaths(0, 0, side, sw)
  page('02 · Le symbole', 'Le X : deux flux qui se rejoignent', `
<div class="cols2">
  <div class="stage"><svg viewBox="-20 -20 ${side + 40} ${side + 40}" width="330" height="330"><rect x="0" y="0" width="${side}" height="${side}" fill="none" stroke="${colors.beton200.hex}" stroke-dasharray="6 6"/><path d="${top}" fill="none" stroke="${colors.maintix.hex}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/><path d="${bottom}" fill="none" stroke="${colors.signal.hex}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${side / 2}" cy="${side / 2}" r="7" fill="${colors.gaine.hex}"/></svg></div>
  <div class="stack">
    <p>Le « x » de <b>Maintix</b> est dessiné comme deux chevrons qui convergent vers un point central.</p>
    <ul class="tick">
      <li><b>Descente et montée</b> : le mouvement d’un ascenseur, métier de nos clients.</li>
      <li><b>Deux acteurs, un point de rencontre</b> : le technicien (terrain) et le responsable (bureau) se rejoignent sur l’intervention.</li>
      <li><b>Le point central</b> : la preuve — ce qui a été fait, signé, scellé.</li>
      <li><b>Teal</b> pour le flux principal, <b>Signal</b> (ambre) pour l’alerte qui appelle l’action.</li>
    </ul>
    <p class="muted small">Construction : carré de côté égal à la hauteur d’x de la police ; trait = épaisseur des empattements-bâtons (fût du « l ») ; angle de 45° ; extrémités et jointures arrondies.</p>
  </div>
</div>`)
}

/* ---------- 04 déclinaisons du logo ---------- */
page('03 · Le logo', 'Les déclinaisons', `
<div class="grid3">
  <div class="tilebox"><div class="art">${logo('color', 300)}</div><b>Horizontal</b><span>Version principale. En-têtes, site, e-mails, documents.</span></div>
  <div class="tilebox"><div class="art" style="height:150px">${stackedSvg({ variant: 'color' }).replace('<svg ', '<svg width="170" ')}</div><b>Empilée</b><span>Écran de connexion, étiquettes, formats carrés.</span></div>
  <div class="tilebox"><div class="art row">${tile(96)}${symbol('color', 90)}</div><b>Icône d’application &amp; symbole</b><span>Application, favicon, avatars. Le symbole seul n’est utilisé que si la marque est déjà identifiée.</span></div>
</div>
<div class="grid3 mt">
  <div class="tilebox dk"><div class="art">${logo('dark', 300)}</div><b>Sur fond Gaine</b><span>Variante « fond sombre » : lettres blanches, flèche haute Lumière.</span></div>
  <div class="tilebox"><div class="art">${logo('ink', 300)}</div><b>Noir</b><span>Tampons, fax, impressions en noir et blanc.</span></div>
  <div class="tilebox dkb"><div class="art">${logo('white', 300)}</div><b>Blanc</b><span>Sur fond de marque ou photo sombre.</span></div>
</div>`)

/* ---------- 05 construction, zone de protection ---------- */
{
  const w = wordmark({ variant: 'color', size: 100 })
  const xh = 54.6
  page('03 · Le logo', 'Zone de protection et tailles minimales', `
<div class="cols2">
  <div class="stage">
    <div class="clear"><div class="clearbox">${logo('color', 360)}<i class="m t">x</i><i class="m b">x</i><i class="m l">x</i><i class="m r">x</i></div></div>
  </div>
  <div class="stack">
    <p><b>Zone de protection</b> : laisser autour du logo un espace libre au moins égal à la <b>hauteur du X</b> (« x » sur le schéma). Aucun texte, bord ou image dans cette zone.</p>
    <h3>Tailles minimales</h3>
    <div class="mins">
      <div><div class="minart">${logo('color', 80)}</div><b>Horizontal</b><span>80 px · 25 mm</span></div>
      <div><div class="minart">${tile(32)}</div><b>Icône</b><span>32 px · 8 mm</span></div>
      <div><div class="minart">${tile(16)}</div><b>Favicon</b><span>16 px</span></div>
    </div>
    <p class="muted small">En dessous de 80 px de large, utiliser l’icône seule. Le logo ne se redessine jamais : on utilise toujours les fichiers fournis (SVG).</p>
    <p class="muted small">Dimensions de référence : hauteur d’x = ${xh} % du corps ; largeur du mot-symbole = ${(w.width / w.height).toFixed(2)} × sa hauteur.</p>
  </div>
</div>`)
}

/* ---------- 06 interdits ---------- */
{
  const bad = (label, style, bg = '#fff', variant = 'color') => `<div class="bad"><div class="badart" style="background:${bg}"><div style="${style}">${logo(variant, 170)}</div></div><span>✕ ${label}</span></div>`
  page('03 · Le logo', 'Ce qu’il ne faut pas faire', `
<div class="grid4">
  ${bad('Déformer', 'transform:scale(1.35,.7)')}
  ${bad('Faire pivoter', 'transform:rotate(-12deg)')}
  ${bad('Changer les couleurs', 'filter:hue-rotate(160deg) saturate(1.6)')}
  ${bad('Ajouter une ombre', 'filter:drop-shadow(4px 6px 3px rgb(0 0 0/.55))')}
  ${bad('Fond peu contrasté', '', '#7dd3c8')}
  ${bad('Fond chargé', '', 'repeating-linear-gradient(45deg,#f59e0b 0 10px,#0f766e 10px 20px)')}
  ${bad('Inverser les flèches', 'transform:scaleY(-1)')}
  ${bad('Alléger les lettres', 'opacity:.35')}
</div>`)
}

/* ---------- 07 couleurs principales ---------- */
{
  const sw = (c, big = false) => `<div class="sw ${big ? 'big' : ''}"><div class="chip" style="background:${c.hex};${['#ffffff', '#f4f6f7', '#eef2f3'].includes(c.hex) ? 'box-shadow:inset 0 0 0 1px #d9e1e2' : ''}"></div><b>${c.name}</b><code>${c.hex.toUpperCase()}</code><span>RGB ${rgb(c.hex).join(' ')}</span><span>HSL ${hsl(c.hex)}</span><em>${c.role}</em></div>`
  page('04 · Couleurs', 'La palette', `
<div class="ratio"><div style="flex:55;background:${colors.beton50.hex};box-shadow:inset 0 0 0 1px #d9e1e2"></div><div style="flex:20;background:${colors.gaine.hex}"></div><div style="flex:18;background:${colors.maintix.hex}"></div><div style="flex:5;background:${colors.signal.hex}"></div><div style="flex:2;background:${colors.lumiere.hex}"></div></div>
<p class="muted small">Répartition indicative : 55 % neutres · 20 % Gaine · 18 % Teal · 5 % Signal · 2 % Lumière. <b>Le Signal est rare</b> : il attire l’œil là où l’action compte.</p>
<div class="swatches">${[colors.gaine, colors.maintix, colors.lumiere, colors.menthe, colors.signal, colors.signalP].map((c) => sw(c, true)).join('')}</div>
<p class="muted small mt">Impression : les valeurs CMJN et Pantone sont à calibrer avec l’imprimeur à partir des teintes RVB ci-dessus.</p>`)
  page('04 · Couleurs', 'Neutres et couleurs fonctionnelles', `
<div class="swatches">${[colors.beton50, colors.beton100, colors.beton200, colors.beton500, colors.blanc].map((c) => sw(c)).join('')}</div>
<h3 class="mt">États d’un point de contrôle</h3>
<div class="states">
  ${Object.values(semantic).map((s) => `<div class="state" style="background:${s.bg};color:${s.fg}"><b>${s.name}</b><code>${s.fg.toUpperCase()}</code><span>fond ${s.bg.toUpperCase()}</span></div>`).join('')}
</div>
<h3 class="mt">Mode sombre</h3>
<div class="darkrow">${Object.entries({ Fond: dark.bg, Carte: dark.surface, Filet: dark.line, Texte: dark.text, 'Teal clair': dark.brand }).map(([k, v]) => `<div style="background:${v};color:${k === 'Texte' || k === 'Teal clair' ? dark.bg : dark.text}"><b>${k}</b><code>${v.toUpperCase()}</code></div>`).join('')}</div>`)
}

/* ---------- 08 accessibilité ---------- */
page('04 · Couleurs', 'Accessibilité : contrastes vérifiés', `
<p class="muted">Rapports calculés selon la formule WCAG 2.1. Objectif : <b>AA (≥ 4,5 : 1)</b> pour tout texte ; ≥ 3 : 1 pour les éléments graphiques.</p>
<table class="contrast"><thead><tr><th>Association</th><th>Aperçu</th><th>Rapport</th><th>Niveau</th></tr></thead><tbody>
${pairs.map((p) => { const g = grade(p.ratio); const bad = g === 'Graphique' || g === 'Non conforme'; return `<tr><td>${p.label}</td><td><span class="pv" style="background:${p.bg};color:${p.fg}">Aa 123</span></td><td>${p.ratio.toFixed(2)} : 1</td><td><span class="lvl ${bad ? 'warn' : 'ok'}">${g}</span>${bad ? ' <small>réservé aux éléments graphiques, jamais au texte</small>' : ''}</td></tr>` }).join('')}
</tbody></table>
<p class="muted small">Règle : le Signal (ambre) n’est <b>jamais</b> utilisé en texte sur fond clair ; utiliser Signal profond. La couleur n’est jamais le seul porteur d’information : un état s’accompagne toujours d’un libellé ou d’une icône.</p>`)

/* ---------- 09 typographie ---------- */
page('05 · Typographie', 'Inter, partout', `
<div class="cols2">
  <div>
    <div class="spec"><div class="big">Aa</div><div><b>Inter</b><span>Licence SIL Open Font (libre, auto-hébergée). Variable, 400 → 800. Lettres du logo : Inter ExtraBold 800, vectorisées.</span></div></div>
    <p class="mono-sample"><b>Chiffres tabulaires</b> pour les mesures et les dates : <span style="font-variant-numeric:tabular-nums">12,4 A · 210 MΩ · 17/10/2026</span></p>
    <p class="muted small">Repli système : system-ui, Segoe UI, Roboto. Hashs et numéros de série en police à chasse fixe.</p>
    <p class="hash">SHA-256 : 134e016578deca04472d187d8c0dd802…</p>
  </div>
  <div class="scale">
    ${type.scale.map((t) => `<div class="row"><span class="lab">${t.name}<small>${t.size} px · ${t.weight}</small></span><span style="font-size:${t.size}px;font-weight:${t.weight};letter-spacing:${t.track};line-height:${t.lh}">${t.name === 'Display' ? 'Visite terminée' : t.name === 'Corps' ? 'Le rapport est envoyé au client.' : 'Ascenseur A1 · Bât. A'}</span></div>`).join('')}
  </div>
</div>
<p class="muted small mt">Corps de texte mobile : <b>16 px minimum</b>. Titres serrés (−1 à −3 %), pas de capitales en continu, pas de texte justifié.</p>`)

/* ---------- 10 iconographie ---------- */
{
  const names = ['CalendarDays', 'ScanLine', 'Siren', 'User', 'LayoutDashboard', 'Building2', 'Users', 'Download', 'TriangleAlert', 'Euro', 'FileText', 'PhoneCall', 'QrCode', 'Settings', 'Check', 'Camera', 'PenLine', 'Wrench', 'Eye', 'Cable', 'traction', 'limiteur', 'parachute', 'cuvette', 'armoire', 'frein', 'cabine']
  page('06 · Iconographie', 'Pictogrammes', `
<div class="cols2" style="grid-template-columns:1.6fr 1fr">
  <div class="icons">${names.map((nm) => `<div>${icon(nm, 30, colors.gaine.hex)}<small>${nm}</small></div>`).join('')}</div>
  <div class="stack">
    <p>Bibliothèque : <b>Lucide</b> (licence ISC, libre). Style unique : <b>trait de 2 px</b>, extrémités et angles arrondis, grille 24 px, un seul niveau de détail.</p>
    <ul class="tick">
      <li>Couleur : Gaine par défaut, Teal pour l’élément actif, Signal pour l’alerte.</li>
      <li>Taille : 20 px minimum ; 24 px en navigation.</li>
      <li>Toujours accompagné d’un libellé dans la navigation.</li>
      <li>Pas d’émojis dans l’interface : ils varient selon l’appareil.</li>
      <li>7 pictogrammes métier dessinés sur la même grille : traction, limiteur, parachute, cuvette, armoire, frein, cabine.</li>
    </ul>
    <p class="muted small">Nouveaux pictogrammes métier : les ajouter dans <code>brand/icons.json</code> (même grille, même trait), puis <code>npm run brand</code>.</p>
  </div>
</div>`)
}

/* ---------- 11 composants ---------- */
page('07 · Interface', 'Composants', `
<div class="ui">
  <div class="uicard"><h3>Boutons</h3><div class="stack"><button class="b p">Terminer et générer le rapport</button><button class="b">Précédent</button><button class="b d">Supprimer</button><button class="b p" disabled>Désactivé</button></div><p class="muted small">Hauteur 56 px, rayon 14 px, libellé = verbe d’action.</p></div>
  <div class="uicard"><h3>Point de contrôle</h3><p><b>Frein : usure garnitures, entrefer</b></p><div class="seg"><span class="ok on">${icon('Check', 18, 'currentColor', 3)} OK</span><span class="watch">${icon('Eye', 18)} Surveiller</span><span class="ko">${icon('X', 18, 'currentColor', 3)} Défaut</span></div><p class="muted small">Trois états, toujours libellés. Un défaut exige une photo.</p></div>
  <div class="uicard"><h3>Badges &amp; santé</h3><div class="row wrap"><span class="bd ok">Validé</span><span class="bd w">À surveiller</span><span class="bd k">critique</span><span class="bd t">En route</span><span class="bd n">Planifiée</span></div><div class="row" style="margin-top:14px"><span class="bd ok">● 96 /100</span><span class="bd w">● 60 /100</span><span class="bd k">● 35 /100</span></div></div>
  <div class="uicard"><h3>Champ</h3><label class="fld">Nom du signataire<input value="Mme Dupont"/></label><label class="fld">Courant moteur (A)<input placeholder="Précédent : 11,8"/></label></div>
  <div class="uicard"><h3>Barre de navigation</h3><div class="tabbar">${[['CalendarDays', 'Ma journée', 1], ['ScanLine', 'Scanner', 0], ['Siren', 'Urgences', 0], ['User', 'Profil', 0]].map(([i, l, a]) => `<span class="${a ? 'on' : ''}">${icon(i, 22)}<small>${l}</small></span>`).join('')}</div></div>
  <div class="uicard"><h3>Alerte</h3><div class="alert"><b>Habilitation expirée</b><span>Travail en hauteur. Contactez le bureau.</span></div></div>
</div>`)

/* ---------- 12 mobile first ---------- */
page('07 · Interface', 'Principes mobile-first', `
<div class="cols4">
  <div class="val">${icon('Hand', 28, colors.maintix.hex)}<b>Une main, des gants</b><span>Cibles tactiles de 56 px. Aucune action critique dans un coin.</span></div>
  <div class="val">${icon('Sun', 28, colors.maintix.hex)}<b>Plein soleil, local sombre</b><span>Contrastes AA minimum ; mode sombre automatique.</span></div>
  <div class="val">${icon('WifiOff', 28, colors.maintix.hex)}<b>Hors ligne d’abord</b><span>Chaque saisie est enregistrée sur l’appareil, puis synchronisée.</span></div>
  <div class="val">${icon('Mic', 28, colors.maintix.hex)}<b>Moins de clavier</b><span>Boutons, listes, photo, dictée. Valeurs précédentes déjà affichées.</span></div>
</div>
<h3 class="mt">Gabarit et rythme</h3>
<div class="cols3">
  <div class="card"><b>Espacements</b><div class="spaces">${space.steps.map((s) => `<div><i style="width:${s}px;height:${s}px"></i><small>${s}</small></div>`).join('')}</div><p class="muted small">Base 4 px. Gouttière écran 16 px.</p></div>
  <div class="card"><b>Rayons</b><div class="radii">${Object.entries(space.radius).map(([k, v]) => `<div><i style="border-radius:${Math.min(v, 28)}px"></i><small>${k} · ${v === 999 ? 'pilule' : v + ' px'}</small></div>`).join('')}</div></div>
  <div class="card"><b>Mouvement</b><p class="small">120 ms (appui), 200 ms (transition), 300 ms max.<br/>Courbe <code>cubic-bezier(.2,.8,.2,1)</code>.<br/>Respecter <code>prefers-reduced-motion</code>.</p></div>
</div>`)

/* ---------- 13 voix ---------- */
page('08 · Ton et voix', 'Comment Maintix parle', `
<div class="cols3">
  <div class="card"><h3>Précis</h3><p>Des faits, des chiffres, des noms d’appareils. Pas de « Oups ! ».</p></div>
  <div class="card"><h3>Direct</h3><p>Phrases courtes, verbes d’action, une idée par message.</p></div>
  <div class="card"><h3>Rassurant</h3><p>Dire ce qui s’est passé et ce qu’on peut faire ensuite. Vouvoiement.</p></div>
</div>
<div class="cols2 mt">
  <div class="dd ok"><b>✓ On écrit</b><ul><li>« Visite terminée. Rapport scellé. »</li><li>« Il manque une photo sur 1 défaut. »</li><li>« Un lien de connexion vous a été envoyé. »</li><li>« Hors ligne : vos saisies sont enregistrées. »</li></ul></div>
  <div class="dd ko"><b>✕ On évite</b><ul><li>« Opération réussie !!! 🎉 »</li><li>« Erreur 422 : entité non traitable »</li><li>« Veuillez renseigner les champs obligatoires »</li><li>« Votre ticket a été créé »</li></ul></div>
</div>
<h3 class="mt">Vocabulaire</h3>
<p class="vocab"><span class="bd t">appareil</span> (pas « équipement ») <span class="bd t">visite</span> (entretien périodique) <span class="bd t">dépannage</span> <span class="bd t">défaut</span> <span class="bd t">rapport scellé</span> <span class="bd t">astreinte</span> <span class="bd t">gardien / syndic</span></p>
<p class="muted small">Majuscule : « Maintix » prend une majuscule initiale, jamais de capitales (« MAINTIX ») ni de camel case.</p>`)

/* ---------- 14 applications ---------- */
page('09 · Applications', 'Marque en situation', `
<div class="apps">
  <div class="app"><div class="phone">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i === 1 ? tile(56) : `<i style="background:${['#cbd5e1', '#94a3b8', '#e2e8f0', '#a5b4c3'][i % 4]}"></i>`)).join('')}</div><b>Icône d’application</b><span>Écran d’accueil, PWA installée.</span></div>
  <div class="app"><div class="report"><div class="rh">${logo('color', 110)}<span>Rapport d’entretien</span></div><div class="rl"></div><div class="rl s"></div><div class="rl"></div><div class="seal">SHA-256 · 134e016578…</div></div><b>Rapport PDF</b><span>En-tête logo, sceau d’intégrité en pied.</span></div>
  <div class="app"><div class="sticker"><div class="sk-top">${logo('white', 100)}</div><img src="${qr}" width="100" height="100" alt=""/><b>Panne ? Scannez pour signaler</b><small>Ascenseur A1 · Bât. A</small></div><b>Étiquette QR</b><span>Collée en cabine et en machinerie.</span></div>
  <div class="app"><div class="mail"><div class="mh">${logo('color', 90)}</div><p><b>Votre lien de connexion</b></p><p class="small">Cliquez pour vous connecter. Valable 15 minutes, usage unique.</p><button class="b p" style="min-height:40px">Me connecter</button></div><b>E-mail</b><span>Sobre, un seul bouton d’action.</span></div>
</div>
<div class="cols2" style="grid-template-columns:440px 1fr;margin-top:14px">
  <div class="og"><img src="data:image/png;base64,${readFileSync(`${dir}assets/og-image-1200x630.png`).toString('base64')}" alt="Image de partage"/><span>Image de partage (1200 × 630)</span></div>
  <div class="stack"><p><b>Nom de domaine, signatures e-mail, présentations</b> : logo horizontal sur fond blanc ou Gaine, zone de protection respectée.</p><p class="muted small">Avatar réseaux sociaux : icône d’application. Bannière : image de partage.</p></div>
</div>`)

/* ---------- 15 fichiers ---------- */
{
  const files = [
    ['maintix-horizontal-{couleur, fond-sombre, noir, blanc}.svg', 'Logo principal (4 variantes)'],
    ['maintix-empile-{couleur, noir, blanc}.svg', 'Logo empilé'],
    ['maintix-symbole-{couleur, fond-sombre, noir, blanc}.svg', 'Symbole seul (X)'],
    ['maintix-icone-app.svg · maintix-icone-maskable.svg', 'Icône d’application (vectoriel)'],
    ['favicon.svg · favicon-32.png · favicon-16.png', 'Favicon'],
    ['icon-192.png · icon-512.png · icon-maskable-512.png', 'PWA (Android, stores, icône adaptative)'],
    ['apple-touch-icon.png', 'iOS : écran d’accueil'],
    ['og-image-1200x630.png', 'Partage de liens et réseaux'],
  ]
  page('10 · Ressources', 'Fichiers et jetons', `
<div class="cols2" style="grid-template-columns:1.2fr 1fr">
  <table class="files"><thead><tr><th>Fichier (dossier brand/assets)</th><th>Usage</th></tr></thead><tbody>
  ${files.map(([f, u]) => `<tr><td><code>${f}</code></td><td>${u}</td></tr>`).join('')}
  </tbody></table>
  <div class="stack">
    <p><b>Dans le code</b></p>
    <ul class="tick"><li><code>brand/tokens.mjs</code> : source unique des couleurs, typo, rayons.</li><li><code>brand/tokens.css</code> et <code>tokens.json</code> : générés.</li><li><code>npm run brand</code> : régénère logos, icônes PNG et cette charte.</li></ul>
    <p class="muted small">Police Inter (SIL OFL) et icônes Lucide (ISC) : libres d’usage commercial.</p>
  </div>
</div>`)
}

/* ---------- document ---------- */
const css = `
@font-face{font-family:'Inter Variable';src:url(data:font/woff2;base64,${font64}) format('woff2');font-weight:100 900}
*{box-sizing:border-box}
@page{size:1280px 720px;margin:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#cfd8d9;font-family:'Inter Variable',system-ui,sans-serif;color:${colors.gaine.hex};font-size:15px;line-height:1.45;font-feature-settings:'cv11','ss03'}
.page{width:1280px;height:720px;background:${colors.beton50.hex};margin:0 auto 24px;position:relative;overflow:hidden;padding:64px 72px 56px;page-break-after:always;break-after:page}
@media print{body{background:none}.page{margin:0}}
.ph{position:absolute;top:26px;left:72px;right:72px;display:flex;justify-content:space-between;font-size:12px;color:${colors.beton500.hex};letter-spacing:.04em;text-transform:uppercase}
.pf{position:absolute;bottom:22px;right:72px;font-size:12px;color:${colors.beton500.hex};font-variant-numeric:tabular-nums}
h2{font-size:38px;letter-spacing:-.03em;font-weight:800;margin:14px 0 22px;line-height:1.05}
h3{font-size:18px;margin:0 0 8px;letter-spacing:-.01em}
p{margin:0 0 10px}
.muted{color:${colors.beton500.hex}} .small{font-size:13px} .mt{margin-top:22px}
code{font-family:ui-monospace,Menlo,monospace;font-size:.88em;background:${colors.beton100.hex};padding:1px 6px;border-radius:5px}
.cols2{display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center}
.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.cols4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.stack{display:grid;gap:10px;align-content:center}
.card{background:#fff;border:1px solid ${colors.beton200.hex};border-radius:16px;padding:18px}
.val{background:#fff;border:1px solid ${colors.beton200.hex};border-radius:16px;padding:18px;display:grid;gap:6px;align-content:start}.val span{color:${colors.beton500.hex};font-size:14px}
ul.tick{list-style:none;margin:0;padding:0;display:grid;gap:8px}ul.tick li{padding-left:22px;position:relative}ul.tick li::before{content:'';position:absolute;left:0;top:.55em;width:10px;height:10px;border-radius:3px;background:${colors.signal.hex}}
.stage{background:#fff;border:1px solid ${colors.beton200.hex};border-radius:20px;min-height:380px;display:grid;place-items:center}
.cover{background:${colors.gaine.hex};color:#fff;display:grid;align-content:center;padding:0 96px}
.cv-logo{margin-bottom:20px}.cv-tag{font-size:30px;color:#b7d3d0;letter-spacing:-.01em;margin:6px 0 0}
.cv-meta{position:absolute;left:96px;bottom:64px;display:grid;gap:2px;color:#b7d3d0}.cv-meta b{color:#fff;font-size:22px}
.cv-arrows{position:absolute;right:-60px;top:110px;opacity:.14}
.tilebox{background:#fff;border:1px solid ${colors.beton200.hex};border-radius:18px;padding:16px;display:grid;gap:6px;align-content:start}.tilebox span{font-size:13px;color:${colors.beton500.hex}}
.tilebox .art{height:112px;display:grid;place-items:center}.art.row{display:flex;gap:24px;justify-content:center;align-items:center}
.tilebox.dk{background:${colors.gaine.hex};color:#fff}.tilebox.dk span{color:#9fbab7}.tilebox.dkb{background:${colors.maintix.hex};color:#fff}.tilebox.dkb span{color:#d7efec}
.clear{padding:40px}.clearbox{position:relative;padding:54px;border:2px dashed ${colors.signal.hex};background:repeating-linear-gradient(45deg,#fff8ea 0 8px,#fff 8px 16px)}
.clearbox svg{display:block;background:#fff}.m{position:absolute;font-style:normal;font-weight:800;color:${colors.signalP.hex};font-size:22px}.m.t{top:14px;left:50%}.m.b{bottom:14px;left:50%}.m.l{left:20px;top:50%}.m.r{right:20px;top:50%}
.mins{display:flex;gap:26px;align-items:flex-end}.mins>div{display:grid;gap:6px;justify-items:start}.mins span{font-size:12px;color:${colors.beton500.hex}}.minart{min-height:36px;display:flex;align-items:flex-end}
.bad{display:grid;gap:8px}.badart{border:1px solid ${colors.beton200.hex};border-radius:14px;height:130px;display:grid;place-items:center;overflow:hidden}.bad span{font-size:13.5px;color:${colors.ko ?? '#b91c1c'};font-weight:600}
.ratio{display:flex;height:38px;border-radius:12px;overflow:hidden;margin-bottom:8px}
.swatches{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-top:10px}.sw{display:grid;gap:3px;font-size:12.5px;align-content:start}.sw .chip{height:110px;border-radius:14px;margin-bottom:6px}.sw.big .chip{height:150px}.sw b{font-size:14.5px}.sw span{color:${colors.beton500.hex}}.sw em{font-style:normal;color:${colors.beton500.hex};margin-top:4px;font-size:12px;line-height:1.35}
.swatches:has(.sw:nth-child(5):last-child){grid-template-columns:repeat(5,1fr)}
.states{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.state{border-radius:14px;padding:14px 16px;display:grid;gap:2px}
.darkrow{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.darkrow code{background:transparent;padding:0;color:inherit;opacity:.85}.darkrow div{border-radius:12px;padding:14px;display:grid;gap:2px;border:1px solid ${dark.line}}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid ${colors.beton200.hex};font-size:13.5px;vertical-align:middle}th{font-size:12px;color:${colors.beton500.hex};text-transform:uppercase;letter-spacing:.04em}
.contrast td{padding:5px 10px}.pv{display:inline-block;padding:3px 12px;border-radius:8px;font-weight:700}.lvl{font-weight:700;padding:2px 8px;border-radius:99px;font-size:12px}.lvl.ok{background:${semantic.ok.bg};color:${semantic.ok.fg}}.lvl.warn{background:${semantic.watch.bg};color:${semantic.watch.fg}}
.spec{display:flex;gap:22px;align-items:center;margin-bottom:12px}.spec .big{font-size:120px;font-weight:800;letter-spacing:-.05em;line-height:1;color:${colors.maintix.hex}}.spec span{display:block;color:${colors.beton500.hex};font-size:13.5px;max-width:300px}
.scale .row{display:grid;grid-template-columns:130px 1fr;align-items:baseline;border-bottom:1px solid ${colors.beton200.hex};padding:9px 0;gap:10px}.lab{font-size:13px;font-weight:600}.lab small{display:block;font-weight:400;color:${colors.beton500.hex}}
.hash{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:${colors.beton500.hex}}
.icons{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.icons div{background:#fff;border:1px solid ${colors.beton200.hex};border-radius:14px;padding:14px 6px;display:grid;justify-items:center;gap:6px}.icons small{font-size:10.5px;color:${colors.beton500.hex}}
.ui{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.uicard{background:#fff;border:1px solid ${colors.beton200.hex};border-radius:16px;padding:16px;display:grid;gap:10px;align-content:start}
.b{min-height:46px;border-radius:14px;border:1px solid ${colors.beton200.hex};background:#fff;font:700 14.5px 'Inter Variable',sans-serif;padding:0 16px;color:${colors.gaine.hex}}.b.p{background:${colors.maintix.hex};color:#fff;border-color:transparent}.b.d{background:${semantic.ko.fg};color:#fff;border-color:transparent}.b:disabled{opacity:.45}
.seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.seg span{border:2px solid ${colors.beton200.hex};border-radius:12px;min-height:46px;display:flex;align-items:center;justify-content:center;gap:5px;font-weight:700;font-size:13px}.seg .ok.on{background:${semantic.ok.bg};border-color:${semantic.ok.fg};color:${semantic.ok.fg}}.seg .watch{color:${colors.beton500.hex}}.seg .ko{color:${colors.beton500.hex}}
.bd{display:inline-flex;padding:3px 10px;border-radius:99px;font-size:12.5px;font-weight:700}.bd.ok{background:${semantic.ok.bg};color:${semantic.ok.fg}}.bd.w{background:${semantic.watch.bg};color:${semantic.watch.fg}}.bd.k{background:${semantic.ko.bg};color:${semantic.ko.fg}}.bd.t{background:${colors.menthe.hex};color:#0b5c55}.bd.n{background:${colors.beton100.hex};color:${colors.beton500.hex}}
.row{display:flex;gap:8px;align-items:center}.row.wrap{flex-wrap:wrap}
.fld{display:grid;gap:4px;font-size:12.5px;font-weight:600}.fld input{min-height:42px;border:1px solid ${colors.beton200.hex};border-radius:12px;padding:0 12px;font:inherit}
.tabbar{display:flex;border:1px solid ${colors.beton200.hex};border-radius:14px;overflow:hidden}.tabbar span{flex:1;display:grid;justify-items:center;gap:2px;padding:9px 2px;color:${colors.beton500.hex}}.tabbar span.on{color:${colors.maintix.hex};font-weight:700}.tabbar small{font-size:10.5px}
.alert{background:${semantic.ko.bg};border:1px solid ${semantic.ko.fg};border-radius:14px;padding:12px;display:grid;gap:2px;color:${colors.gaine.hex}}.alert span{font-size:13px}
.spaces{display:flex;gap:10px;align-items:flex-end;margin:10px 0}.spaces div{display:grid;gap:4px;justify-items:center}.spaces i{background:${colors.maintix.hex};border-radius:3px;display:block}.spaces small,.radii small{font-size:10.5px;color:${colors.beton500.hex}}
.radii{display:flex;gap:12px;margin-top:10px}.radii div{display:grid;gap:4px;justify-items:center}.radii i{width:44px;height:44px;background:${colors.menthe.hex};border:2px solid ${colors.maintix.hex};display:block}
.dd{border-radius:16px;padding:16px 18px}.dd ul{margin:6px 0 0;padding-left:18px;display:grid;gap:4px}.dd.ok{background:${semantic.ok.bg}}.dd.ko{background:${semantic.ko.bg}}
.vocab{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.apps{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.app{display:grid;gap:6px;align-content:start}.app>span{font-size:12.5px;color:${colors.beton500.hex}}
.phone{background:#e8edee;border:1px solid ${colors.beton200.hex};border-radius:22px;height:190px;padding:20px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;align-content:start}.phone i{display:block;width:100%;aspect-ratio:1;border-radius:14px}.phone svg{width:100%;height:auto}
.report{background:#fff;border:1px solid ${colors.beton200.hex};border-radius:6px;height:200px;padding:14px;display:grid;gap:8px;align-content:start;box-shadow:0 2px 8px rgb(0 0 0/.08)}.rh{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${colors.maintix.hex};padding-bottom:8px;font-size:11px;font-weight:700}.rl{height:7px;background:${colors.beton100.hex};border-radius:4px}.rl.s{width:60%}.seal{margin-top:auto;font:10px ui-monospace,monospace;color:${colors.beton500.hex}}
.sticker{background:#fff;border:1px solid ${colors.beton200.hex};border-radius:14px;height:200px;display:grid;justify-items:center;align-content:start;gap:4px;overflow:hidden;font-size:12px;text-align:center}.sk-top{background:${colors.gaine.hex};width:100%;display:grid;place-items:center;padding:8px 0}.sticker img{margin-top:4px}.sticker small{color:${colors.beton500.hex}}
.mail{background:#fff;border:1px solid ${colors.beton200.hex};border-radius:12px;height:200px;padding:14px;display:grid;gap:6px;align-content:start}.mh{padding-bottom:8px;border-bottom:1px solid ${colors.beton200.hex}}
.og{display:grid;gap:4px;max-width:440px}.og img{width:100%;border-radius:12px;border:1px solid ${colors.beton200.hex}}.og span{font-size:12.5px;color:${colors.beton500.hex}}
.files td{padding:5px 10px;font-size:12.5px}
`
const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Maintix — Charte graphique</title><style>${css}</style><body>${pages.join('\n')}</body></html>`
writeFileSync(`${out}maintix-charte-graphique.html`, html)

const browser = await chromium.launch()
const pg = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await pg.setContent(html, { waitUntil: 'load' })
await pg.evaluate(() => document.fonts.ready)
await pg.pdf({ path: `${out}maintix-charte-graphique.pdf`, width: '1280px', height: '720px', printBackground: true })
// vignettes pour contrôle visuel
const count = await pg.locator('.page').count()
for (let i = 0; i < count; i++) await pg.locator('.page').nth(i).screenshot({ path: `${out}pages/p${String(i + 1).padStart(2, '0')}.png` })
await browser.close()
console.log(`charte ok : ${count} pages`)
void contrast
