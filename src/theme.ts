export type Theme = 'light' | 'dark' | 'auto'
const KEY = 'maintix-theme'

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'auto'
  } catch { return 'auto' }
}

/** Applique le thème au document et le mémorise sur l'appareil. */
export function setTheme(t: Theme, persist = true) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
  if (!persist) return
  try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t) } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event('maintix-theme')) // après l'écriture : les boutons relisent le choix mémorisé
}
