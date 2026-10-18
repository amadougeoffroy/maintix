import { useEffect, useRef, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { compressImage } from '../util'
import { saveBlob, useImageSrc } from '../files'
import { Icon } from './Icon'
import { healthLevel } from '../store'
import type { JobStatus, JobType, Severity } from '../types'

export function Badge({ tone, children }: { tone?: 'ok' | 'warn' | 'bad' | 'brand'; children: ReactNode }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>
}
export const SeverityBadge = ({ s }: { s: Severity }) => (
  <Badge tone={s === 'critique' ? 'bad' : s === 'majeur' ? 'warn' : undefined}>{s}</Badge>
)
export const JOB_LABEL: Record<JobType, string> = { entretien: 'Entretien', depannage: 'Dépannage', travaux: 'Travaux', controle: 'Contrôle' }
export const STATUS_LABEL: Record<JobStatus, string> = { planifiee: 'Planifiée', en_route: 'En route', sur_place: 'Sur place', terminee: 'Terminée' }
export const StatusBadge = ({ s }: { s: JobStatus }) => (
  <Badge tone={s === 'terminee' ? 'ok' : s === 'planifiee' ? undefined : 'brand'}>{STATUS_LABEL[s]}</Badge>
)
export function Health({ score }: { score: number }) {
  const l = healthLevel(score)
  return (
    <span className={`badge ${l}`}>
      <span className={`dot ${l}`} /> <span className="health">{score}</span>/100
    </span>
  )
}

export function Toast({ msg }: { msg: string | null }) {
  return msg ? <div className="toast" role="status">{msg}</div> : null
}
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const show = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2500)
  }
  return { msg, show }
}

export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online ? null : <div className="offline" role="status">Hors ligne : vos saisies sont enregistrées sur l’appareil.</div>
}

/** Image d'une référence `file:` ou d'une data-URL. */
export function Img({ r, alt, style, className }: { r: string; alt: string; style?: React.CSSProperties; className?: string }) {
  const src = useImageSrc(r)
  return src ? <img src={src} alt={alt} style={style} className={className} /> : <span className="img-ph" style={style} role="img" aria-label={`${alt} (chargement)`} />
}

export function PhotoPicker({ photos, onAdd, label = 'Ajouter une photo' }: { photos: string[]; onAdd: (ref: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="stack">
      {photos.length > 0 && (
        <div className="photos">
          {photos.map((p, i) => (
            <Img key={i} r={p} alt={`Photo ${i + 1}`} />
          ))}
        </div>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) onAdd(await saveBlob(await (await fetch(await compressImage(f))).blob()))
          e.target.value = ''
        }}
      />
      <button type="button" className="btn" onClick={() => ref.current?.click()}>
        <Icon n="camera" /> {label}
      </button>
    </div>
  )
}

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)
  useEffect(() => {
    const c = ref.current!
    const ratio = window.devicePixelRatio || 1
    c.width = c.clientWidth * ratio
    c.height = c.clientHeight * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111'
  }, [])
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  return (
    <div className="stack">
      <canvas
        ref={ref}
        className="sig"
        aria-label="Zone de signature"
        onPointerDown={(e) => {
          drawing.current = true
          ref.current!.setPointerCapture(e.pointerId)
          const ctx = ref.current!.getContext('2d')!
          const p = pos(e)
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = ref.current!.getContext('2d')!
          const p = pos(e)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
        }}
        onPointerUp={() => {
          if (!drawing.current) return
          drawing.current = false
          setEmpty(false)
          onChange(ref.current!.toDataURL('image/png'))
        }}
      />
      <button
        type="button"
        className="btn sm"
        disabled={empty}
        onClick={() => {
          const c = ref.current!
          c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
          setEmpty(true)
          onChange(null)
        }}
      >
        Effacer
      </button>
    </div>
  )
}

export function QR({ value, size = 160 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: size * 2 }).then(setSrc).catch(() => setSrc(''))
  }, [value, size])
  return src ? <img src={src} alt="QR code" width={size} height={size} /> : <div style={{ width: size, height: size }} />
}
export const publicUrl = (path: string) => `${location.origin}${location.pathname}#${path}`

/** Dictée vocale (Web Speech API) quand le navigateur le permet. */
export function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false)
  const Rec = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition
  if (!Rec) return null
  return (
    <button
      type="button"
      className={`btn sm ${on ? 'danger' : ''}`}
      onClick={() => {
        const r = new Rec()
        r.lang = 'fr-FR'
        r.interimResults = false
        r.onresult = (ev) => onText(ev.results[0][0].transcript)
        r.onend = () => setOn(false)
        r.onerror = () => setOn(false)
        setOn(true)
        r.start()
      }}
    >
      <Icon n="mic" /> {on ? 'J’écoute…' : 'Dicter'}
    </button>
  )
}
interface SR {
  lang: string
  interimResults: boolean
  onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void
  onend: () => void
  onerror: () => void
  start: () => void
}

/** Lecteur de QR par caméra (BarcodeDetector) avec repli manuel côté page. */
export function QRScanner({ onCode }: { onCode: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')
  const supported = 'BarcodeDetector' in window
  useEffect(() => {
    if (!supported) return
    let stop = false
    let stream: MediaStream | undefined
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        video.current!.srcObject = stream
        await video.current!.play()
        const Det = (window as unknown as { BarcodeDetector: new (o: object) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
        const det = new Det({ formats: ['qr_code'] })
        const loop = async () => {
          if (stop) return
          const codes = await det.detect(video.current!).catch(() => [])
          if (codes[0]) onCode(codes[0].rawValue)
          else setTimeout(loop, 300)
        }
        loop()
      } catch {
        setErr('Caméra indisponible : choisissez l’appareil dans la liste.')
      }
    })()
    return () => {
      stop = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [supported, onCode])
  if (!supported) return <p className="muted small">Lecture caméra non prise en charge par ce navigateur : utilisez la liste ci-dessous.</p>
  return (
    <div className="stack">
      <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 12, background: '#000', maxHeight: 280, objectFit: 'cover' }} />
      {err && <p className="muted small">{err}</p>}
    </div>
  )
}
