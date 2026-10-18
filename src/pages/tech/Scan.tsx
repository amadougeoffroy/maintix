import { useCallback } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { norm } from '../../importer'
import { byId, useData } from '../../store'
import { QRScanner } from '../../components/ui'

export function parseElevatorId(text: string): string | null {
  const m = text.match(/#\/(?:signal|tech\/elevator|status)\/([\w-]+)/)
  return m ? m[1] : null
}

export default function Scan() {
  const s = useData()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const words = norm(q).split(' ').filter(Boolean)
  const shown = s.elevators.filter((e) => { const site = byId(s.sites, e.siteId); const t = norm(`${e.label} ${e.brand} ${e.model} ${e.serial} ${site?.name ?? ''} ${site?.address ?? ''}`); return words.every((w) => t.includes(w)) })
  const onCode = useCallback(
    (text: string) => {
      const id = parseElevatorId(text)
      if (id) nav(`/tech/elevator/${id}`)
    },
    [nav],
  )
  return (
    <div className="stack-lg">
      <h1>Scanner un appareil</h1>
      <QRScanner onCode={onCode} />
      <section className="stack">
        <h2>Ou chercher un appareil</h2>
        <input type="search" aria-label="Rechercher un appareil" placeholder="Nom, site, adresse, n° de série…" value={q} onChange={(e) => setQ(e.target.value)} />
        {shown.length === 0 && <p className="muted">Aucun appareil trouvé.</p>}
        {shown.map((e) => {
          const site = byId(s.sites, e.siteId)
          return (
            <Link key={e.id} to={`/tech/elevator/${e.id}`} className="card link">
              <strong>{e.label}</strong>
              <p className="muted small">{site?.name} · {e.brand} {e.model}</p>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
