import { Link } from 'react-router-dom'
import { Check, Circle, Rocket } from 'lucide-react'
import { gettingStartedSteps, patchOnboarding, useOnboarding } from '../onboarding'
import { runtime, useData } from '../store'

/** Liste « Premiers pas » du tableau de bord : se coche d'après les données, chaque ligne mène au bon écran. */
export function GettingStarted() {
  const s = useData()
  const { loaded, flags } = useOnboarding()
  if (!runtime.server || !loaded || flags.gettingStartedHidden) return null
  const steps = gettingStartedSteps(s, flags)
  const done = steps.filter((x) => x.done).length
  const all = done === steps.length
  const next = steps.find((x) => !x.done)
  return (
    <section className="card gs" aria-labelledby="gs-title">
      <div className="row between wrap">
        <div className="row"><Rocket size={22} aria-hidden="true" color="var(--brand)" /><h2 id="gs-title">{all ? 'Tout est prêt !' : 'Premiers pas'}</h2></div>
        <div className="row"><span className="badge brand">{done}/{steps.length}</span><button className="btn sm" onClick={() => patchOnboarding({ gettingStartedHidden: true })}>{all ? 'Terminer' : 'Masquer'}</button></div>
      </div>
      <div className="progress" role="progressbar" aria-label="Avancement des premiers pas" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}><div style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      {all && <p className="muted">Votre espace est configuré. Vous pouvez masquer cette liste ; elle reste disponible dans Réglages → Aide et données.</p>}
      <ol className="gs-list">
        {steps.map((st) => (
          <li key={st.key} className={`${st.done ? 'done' : ''} ${next?.key === st.key ? 'next' : ''}`}>
            <span className="gs-mark" aria-hidden="true">{st.done ? <Check size={16} /> : <Circle size={16} />}</span>
            <div className="grow"><strong>{st.title}</strong>{!st.done && <p className="small muted">{st.why}</p>}</div>
            <span className="sr-only">{st.done ? 'Terminé' : 'À faire'}</span>
            {!st.done && (
              <div className="row">
                {st.manual && <button className="btn sm" onClick={() => patchOnboarding({ [st.manual!]: true })}>C’est fait</button>}
                <Link className={`btn sm ${next?.key === st.key ? 'primary' : ''}`} to={st.to}>{st.action}</Link>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
