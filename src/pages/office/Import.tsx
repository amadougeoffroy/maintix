import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseParc, TEMPLATE_CSV } from '../../importer'
import { actions } from '../../store'
import { xlsxToText } from '../../xlsx'
import { Icon } from '../../components/Icon'

export default function Import() {
  const [text, setText] = useState('')
  const [done, setDone] = useState<{ clients: number; sites: number; elevators: number } | null>(null)
  const [fileErr, setFileErr] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const res = useMemo(() => (text.trim() ? parseParc(text) : null), [text])

  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + TEMPLATE_CSV], { type: 'text/csv' }))
    a.download = 'modele-import-parc.csv'
    a.click()
  }

  return (
    <div className="stack-lg">
      <div><h1>Importer le parc</h1><p className="muted">Chargez un fichier Excel (.xlsx) ou CSV, ou collez vos lignes depuis Excel. Les colonnes sont reconnues automatiquement.</p></div>
      <div className="row wrap">
        <button className="btn" onClick={() => file.current?.click()}><Icon n="folder" /> Charger un fichier Excel ou CSV</button>
        <button className="btn" onClick={download}>⬇️ Modèle CSV</button>
        <input ref={file} type="file" accept=".xlsx,.csv,.txt,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setText(/\.xlsx$/i.test(f.name) ? await xlsxToText(f) : await f.text()); setFileErr('') } catch { setFileErr('Fichier illisible : enregistrez-le au format .xlsx ou .csv.') } setDone(null) } e.target.value = '' }} />
      </div>
      {fileErr && <p role="alert" style={{ color: 'var(--bad)' }}>{fileErr}</p>}
      <label className="field">Données à importer
        <textarea style={{ minHeight: 160, fontFamily: 'ui-monospace, monospace', fontSize: '.8rem' }} value={text} onChange={(e) => { setText(e.target.value); setDone(null) }} placeholder={'Client;Site;Adresse;Appareil;Marque;N° série;Année\n…'} />
      </label>

      {res && (
        <section className="stack">
          <h2>Aperçu</h2>
          <p className="small muted">Colonnes reconnues : {Object.entries(res.mapping).map(([h, f]) => `${h} → ${f}`).join(' · ') || 'aucune'}</p>
          {res.errors.length > 0 && <div className="card alert"><strong>{res.errors.length} alerte(s)</strong><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{res.errors.slice(0, 8).map((e, i) => <li key={i}>Ligne {e.line} : {e.message}</li>)}</ul></div>}
          {res.rows.length > 0 && (
            <div className="card pad0 tablewrap"><table>
              <thead><tr><th>Client</th><th>Site</th><th>Appareil</th><th>Marque</th><th>N° série</th><th>Année</th></tr></thead>
              <tbody>{res.rows.slice(0, 20).map((r, i) => <tr key={i}><td>{r.client}</td><td>{r.site}</td><td>{r.label}</td><td>{r.brand}</td><td>{r.serial}</td><td>{r.year}</td></tr>)}</tbody>
            </table></div>
          )}
          {res.rows.length > 20 && <p className="small muted">… et {res.rows.length - 20} autres lignes.</p>}
          <button className="btn primary" disabled={res.rows.length === 0} onClick={() => { setDone(actions.importParc(res.rows)); setText('') }}>Importer {res.rows.length} appareil(s)</button>
        </section>
      )}
      {done && <div className="card" style={{ borderColor: 'var(--ok)' }} role="status"><Icon n="done" /> {done.elevators} appareil(s), {done.sites} site(s) et {done.clients} client(s) créés. <Link to="/office/parc">Voir le parc</Link></div>}
    </div>
  )
}
