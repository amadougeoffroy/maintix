import { useEffect } from 'react'
import { byId, runtime, useData } from '../../store'
import { patchOnboarding, useOnboarding } from '../../onboarding'
import { Logo } from '../../brand/Logo'
import { QR, publicUrl } from '../../components/ui'
import { Icon } from '../../components/Icon'

export default function QRPrint() {
  const s = useData()
  const { loaded, flags } = useOnboarding()
  useEffect(() => { if (runtime.server && loaded && !flags.qrDone && s.elevators.length > 0) patchOnboarding({ qrDone: true }) }, [loaded, flags.qrDone, s.elevators.length])
  return (
    <div className="stack-lg">
      <div className="row between wrap no-print"><div><h1>QR codes des appareils</h1><p className="muted">À imprimer et coller dans la cabine / machinerie. Le même QR sert au technicien (fiche) et au public (signalement).</p></div><button className="btn primary" onClick={() => window.print()}><Icon n="printer" /> Imprimer</button></div>
      <div className="qrgrid">
        {s.elevators.map((e) => (
          <div key={e.id} className="qrbox">
            <div className="qr-brand"><Logo variant="color" height={20} /></div>
            <QR value={publicUrl(`/signal/${e.id}`)} size={150} />
            <strong>Panne ? Scannez pour signaler</strong>
            <span style={{ fontSize: '.8rem' }}>{e.label} · {byId(s.sites, e.siteId)?.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
