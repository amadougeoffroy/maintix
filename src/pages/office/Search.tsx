import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../../store'
import { KIND_LABEL, search, type SearchKind } from '../../search'

export default function Search() {
  const s = useData()
  const [q, setQ] = useState('')
  const hits = useMemo(() => search(s, q, 8), [s, q])
  const groups = (Object.keys(KIND_LABEL) as SearchKind[]).map((k) => [k, hits.filter((h) => h.kind === k)] as const).filter(([, h]) => h.length)
  return (
    <div className="stack-lg">
      <h1>Recherche</h1>
      <input type="search" autoFocus aria-label="Rechercher" placeholder="Client, appareil, n° de série, défaut, facture…" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim() && groups.length === 0 && <p className="muted">Aucun résultat pour « {q} ».</p>}
      {!q.trim() && <p className="muted small">Astuce : <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> ouvre la recherche depuis n’importe quel écran du bureau.</p>}
      {groups.map(([kind, list]) => (
        <section key={kind} className="stack">
          <h2>{KIND_LABEL[kind]}</h2>
          {list.map((h) => (
            <Link key={h.kind + h.id} to={h.to} className="card link"><strong>{h.title}</strong><p className="small muted">{h.subtitle}</p></Link>
          ))}
        </section>
      ))}
    </div>
  )
}
