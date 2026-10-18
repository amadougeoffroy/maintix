import {
  ArrowDownToLine, ArrowUpDown, Ban, Building2, Cable, Camera, Check, CheckCircle2, DoorOpen, Download, Euro, Eye, FileText, FolderOpen, Mail,
  MapPin, Mic, Monitor, Navigation, Pencil, PenLine, PhoneCall, Pin, Printer, ShieldCheck, Siren, Sparkles, Trash2, TriangleAlert, Wrench, X, Settings,
  type LucideIcon,
} from 'lucide-react'

const ICONS = {
  camera: Camera, mic: Mic, folder: FolderOpen, pencil: Pencil, trash: Trash2, siren: Siren, wrench: Wrench, monitor: Monitor, building: Building2,
  done: CheckCircle2, check: Check, x: X, mail: Mail, printer: Printer, alert: TriangleAlert, file: FileText, pin: Pin, euro: Euro, import: Download,
  ban: Ban, compass: Navigation, mappin: MapPin, eye: Eye, sparkles: Sparkles, pen: PenLine, door: DoorOpen, settings: Settings, shield: ShieldCheck,
  cable: Cable, lift: ArrowUpDown, shaft: ArrowDownToLine, phone: PhoneCall,
} satisfies Record<string, LucideIcon>
import custom from '../../brand/icons.json'
type Node = [string, Record<string, string>]
const CUSTOM = Object.fromEntries(Object.entries(custom).filter(([k]) => !k.startsWith('_'))) as Record<string, Node[]>
export type IconName = keyof typeof ICONS | 'traction' | 'limiteur' | 'parachute' | 'cuvette' | 'armoire' | 'frein' | 'cabine'

/** Pictogramme de la charte Maintix (Lucide, trait de 2 px). Décoratif : le libellé voisin porte le sens. */
export function Icon({ n, size = 18, className = '' }: { n: IconName; size?: number; className?: string }) {
  const nodes = CUSTOM[n]
  if (nodes) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`ic ${className}`}>
        {nodes.map(([tag, attrs], i) => (tag === 'circle' ? <circle key={i} {...attrs} /> : tag === 'rect' ? <rect key={i} {...attrs} /> : <path key={i} {...attrs} />))}
      </svg>
    )
  }
  const C = ICONS[n as keyof typeof ICONS]
  return <C size={size} strokeWidth={2} aria-hidden="true" className={`ic ${className}`} />
}
