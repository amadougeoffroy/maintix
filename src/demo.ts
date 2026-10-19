/** Mode démonstration : explicite sur un vrai site (choisi depuis la page d'accueil), automatique seulement en développement local
 *  quand aucun serveur ne répond. Les données de démonstration restent séparées de celles du serveur (autre clé de stockage). */
const FLAG = 'maintix-demo'
const DEMO_SESSION = 'cabine-demo-session'

/** Détermine le mode de l'application au démarrage.
 *  - démo explicite : choisie depuis la page d'accueil, même si le serveur répond (données locales séparées) ;
 *  - démo automatique : seulement en développement local quand aucun serveur ne répond ;
 *  - sinon, serveur injoignable sur un vrai site : on n'affiche JAMAIS la démo à la place, mais un message « service injoignable ». */
export function decideMode(i: { reachable: boolean; explicitDemo: boolean; localHost: boolean }) {
  const demo = i.explicitDemo || (!i.reachable && i.localHost)
  return { demo, explicitDemo: i.explicitDemo, server: i.reachable && !demo, unreachable: !i.reachable && !demo }
}

export const isLocalHost = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.hostname.endsWith('.localhost')
export function demoRequested(): boolean {
  try { return localStorage.getItem(FLAG) === '1' } catch { return false }
}
/** Active la démonstration et recharge l'application sur le choix du profil. */
export function startDemo() {
  try { localStorage.setItem(FLAG, '1') } catch { /* stockage indisponible */ }
  location.assign(`${location.pathname}#/demo`)
  location.reload()
}
/** Quitte la démonstration et revient à la page d'accueil. */
export function leaveDemo() {
  try { localStorage.removeItem(FLAG); localStorage.removeItem(DEMO_SESSION) } catch { /* ignoré */ }
  location.assign(`${location.pathname}#/`)
  location.reload()
}
