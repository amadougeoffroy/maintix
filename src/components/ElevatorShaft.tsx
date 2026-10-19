import { useEffect, useState } from 'react'

const FLOORS = ['RDC', '1', '2', '3']
const SEQUENCE = [0, 2, 3, 1, 0] // la cabine dessert les étages dans cet ordre, en boucle
const FLOOR_Y = (i: number) => 300 - i * 90

/** Illustration animée : une cabine monte et descend dans sa gaine, portes qui s'ouvrent à chaque étage, afficheur lumineux.
 *  Purement décorative (aria-hidden) ; à l'arrêt si l'utilisateur préfère réduire les animations. */
export function ElevatorShaft() {
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(true)
  const [moving, setMoving] = useState(false)
  const floor = SEQUENCE[step % SEQUENCE.length]
  const prev = SEQUENCE[(step + SEQUENCE.length - 1) % SEQUENCE.length]
  const dir = floor === prev ? 0 : floor > prev ? 1 : -1

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
    const cycle = (n: number) => {
      later(2200, () => { setOpen(false) })        // portes fermées après une pause
      later(2900, () => { setMoving(true); setStep(n + 1) }) // la cabine part
      later(4500, () => { setMoving(false); setOpen(true) }) // arrivée : les portes s'ouvrent
      later(4500, () => cycle(n + 1))
    }
    cycle(0)
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="shaft" aria-hidden="true">
      <div className="shaft-display"><span className="shaft-arrow">{moving ? (dir > 0 ? '▲' : dir < 0 ? '▼' : '') : ''}</span><span className="shaft-floor">{FLOORS[floor]}</span></div>
      <svg viewBox="0 0 260 410" className="shaft-svg">
        <defs><clipPath id="cab-clip"><rect x="76" y="6" width="108" height="68" /></clipPath></defs>
        <rect x="30" y="10" width="200" height="385" rx="10" className="shaft-wall" />
        {FLOORS.map((f, i) => (
          <g key={f}>
            <line x1="30" x2="230" y1={FLOOR_Y(i) + 80} y2={FLOOR_Y(i) + 80} className="shaft-line" />
            <text x="12" y={FLOOR_Y(i) + 48} className="shaft-label" textAnchor="middle">{f}</text>
          </g>
        ))}
        <line x1="130" x2="130" y1="10" y2={FLOOR_Y(floor) + 2} className="shaft-cable" style={{ transition: 'all 1.6s cubic-bezier(.65,0,.35,1)' }} />
        <g style={{ transform: `translateY(${FLOOR_Y(floor)}px)`, transition: 'transform 1.6s cubic-bezier(.65,0,.35,1)' }}>
          <rect x="70" y="0" width="120" height="80" rx="6" className="cab-body" />
          <rect x="76" y="6" width="108" height="68" rx="3" className="cab-inside" />
          {/* petit pictogramme Maintix dans la cabine : le X en deux chevrons */}
          <path d="M112 22l18 18 18-18" className="cab-x-top" />
          <path d="M112 62l18-18 18 18" className="cab-x-bottom" />
          <g clipPath="url(#cab-clip)">
            <g style={{ transform: `translateX(${open ? -52 : 0}px)`, transition: 'transform .7s ease' }}><rect x="76" y="6" width="54" height="68" className="cab-door" /></g>
            <g style={{ transform: `translateX(${open ? 52 : 0}px)`, transition: 'transform .7s ease' }}><rect x="130" y="6" width="54" height="68" className="cab-door" /></g>
          </g>
        </g>
      </svg>
    </div>
  )
}
