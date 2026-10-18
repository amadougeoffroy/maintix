import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { enterSession } from '../session'

/** Page d'arrivée du lien magique : l'échange du jeton se fait par POST (pas de consommation par un aperçu de lien). */
export default function Auth() {
  const [q] = useSearchParams()
  const nav = useNavigate()
  const [error, setError] = useState(false)
  const done = useRef(false)
  useEffect(() => {
    const token = q.get('token')
    if (!token) return setError(true)
    if (done.current) return
    done.current = true
    api.verify(token).then(async (info) => { await enterSession(info); nav('/', { replace: true }) }).catch(() => setError(true))
  }, [q, nav])
  return (
    <div className="hero"><div className="box center stack">
      {error ? (<><h1>Lien invalide ou expiré</h1><p className="muted">Les liens sont valables 15 minutes et ne servent qu’une fois.</p><Link className="btn primary" to="/login">Recevoir un nouveau lien</Link></>) : <p role="status">Connexion…</p>}
    </div></div>
  )
}
