import { byId, certStatus, actions, runtime, useData } from '../../store'
import { Badge } from '../../components/ui'
import { OrgSwitcher } from '../../components/OrgSwitcher'
import { NotificationSettings } from '../../components/NotificationSettings'
import { fmtDateLong, today } from '../../util'

export default function Profile() {
  const s = useData()
  const me = byId(s.techs, s.session.techId)
  if (!me) return null
  const st = certStatus(me)
  const setTheme = (t: 'light' | 'dark' | 'auto') => {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', t)
  }
  return (
    <div className="stack-lg">
      <h1>{me.name}</h1>
      <NotificationSettings />
      <OrgSwitcher />
      <section className="stack">
        <h2>Habilitations</h2>
        {me.certs.map((c) => (
          <div key={c.label} className="card row between">
            <div><strong>{c.label}</strong><p className="small muted">Expire le {fmtDateLong(c.expires)}</p></div>
            <Badge tone={c.expires < today() ? 'bad' : st.soon.includes(c) ? 'warn' : 'ok'}>{c.expires < today() ? 'Expirée' : st.soon.includes(c) ? 'Bientôt' : 'Valide'}</Badge>
          </div>
        ))}
      </section>
      <section className="stack">
        <h2>Affichage</h2>
        <div className="seg">
          <button onClick={() => setTheme('auto')}>Auto</button>
          <button onClick={() => setTheme('light')}>Clair</button>
          <button onClick={() => setTheme('dark')}>Sombre</button>
        </div>
      </section>
      {!runtime.server && <button className="btn danger" onClick={() => { if (confirm('Réinitialiser toutes les données de démonstration ?')) actions.resetDemo() }}>Réinitialiser la démo</button>}
    </div>
  )
}
