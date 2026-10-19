import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { getTheme, setTheme } from '../theme'

const systemDark = () => !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
const effectiveDark = () => { const t = getTheme(); return t === 'dark' || (t === 'auto' && systemDark()) }

/** Bouton clair / sombre : bascule entre les deux thèmes (le choix est mémorisé sur l'appareil). */
export function ThemeToggle({ className = 'btn sm ghost' }: { className?: string }) {
  const [dark, setDark] = useState(effectiveDark)
  useEffect(() => {
    const sync = () => setDark(effectiveDark())
    window.addEventListener('maintix-theme', sync)
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener('change', sync)
    return () => { window.removeEventListener('maintix-theme', sync); mq?.removeEventListener('change', sync) }
  }, [])
  const Icon = dark ? Sun : Moon
  return (
    <button type="button" className={className} aria-label={dark ? 'Passer au thème clair' : 'Passer au thème sombre'} title={dark ? 'Thème clair' : 'Thème sombre'} onClick={() => setTheme(dark ? 'light' : 'dark')}>
      <Icon size={18} aria-hidden="true" />
    </button>
  )
}
