import PDFDocument from 'pdfkit'
import logo from '../../brand/logo-data.json'
import { MEASURES, ZONES } from '../../shared/checklist'
import { totals } from '../../shared/money'

type Doc = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ReportData {
  job: Doc
  elevator: Doc
  site: Doc
  client: Doc
  tech?: Doc
  defects: Doc[]
  files: Map<string, Buffer>
  sealValid: boolean
  appUrl: string
  compress?: boolean
}

const C = { ink: '#0b2b2a', teal: '#0f766e', amber: '#f59e0b', muted: '#5b6b6a', line: '#d9e1e2', ok: '#166534', watch: '#92400e', ko: '#b91c1c', bg: '#f4f6f7' }
const STATUS = { ok: ['OK', C.ok], watch: ['À surveiller', C.watch], ko: ['Défaut', C.ko] } as const
const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
const timeFr = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
const TYPE_LABEL: Record<string, string> = { entretien: 'Rapport d’entretien', depannage: 'Rapport de dépannage', travaux: 'Rapport de travaux', controle: 'Rapport de contrôle' }

/** Dessine le mot-symbole Maintix (vectoriel) avec la largeur donnée. */
export function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, width: number, variant: 'color' | 'white' = 'color') {
  const l = logo[variant]
  const [vx, vy] = l.viewBox.split(' ').map(Number)
  const k = width / l.width
  doc.save().translate(x, y).scale(k).translate(-vx, -vy)
  for (const m of l.inner.matchAll(/<path d="([^"]+)"([^>]*)\/>/g)) {
    const attrs = m[2]
    const fill = attrs.match(/fill="(#[0-9a-f]{6}|none)"/i)?.[1]
    const stroke = attrs.match(/stroke="(#[0-9a-f]{6})"/i)?.[1]
    const sw = Number(attrs.match(/stroke-width="([\d.]+)"/)?.[1] ?? 0)
    doc.path(m[1])
    if (stroke) doc.lineWidth(sw).lineCap('round').lineJoin('round').stroke(stroke)
    else if (fill && fill !== 'none') doc.fill(fill)
  }
  doc.restore()
  return (width * l.height) / l.width
}

export function decodeRef(ref: string | undefined, files: Map<string, Buffer>): Buffer | null {
  if (!ref) return null
  if (ref.startsWith('file:')) return files.get(ref) ?? null
  const m = ref.match(/^data:image\/(png|jpeg);base64,(.+)$/)
  return m ? Buffer.from(m[2], 'base64') : null
}

/** Génère le PDF d'un rapport clôturé (A4). */
export function buildReportPdf(d: ReportData): Promise<Buffer> {
  const { job, elevator, site, client, tech, defects, files } = d
  const v: Doc = job.visit ?? {}
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, compress: d.compress ?? true, info: { Title: `${TYPE_LABEL[job.type] ?? 'Rapport'} – ${elevator.label}`, Author: 'Maintix', Subject: 'Rapport scellé' } })
  const chunks: Buffer[] = []
  doc.on('data', (b: Buffer) => chunks.push(b))
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  const L = 48
  const W = doc.page.width - 96
  const bottom = () => doc.page.height - 70
  const need = (h: number) => { if (doc.y + h > bottom()) doc.addPage() }
  const h2 = (t: string) => {
    need(40)
    doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor(C.ink).text(t, L, doc.y)
    doc.moveTo(L, doc.y + 2).lineTo(L + W, doc.y + 2).lineWidth(1.5).strokeColor(C.teal).stroke()
    doc.moveDown(0.5)
  }
  const kv = (k: string, val: string) => {
    need(18)
    const y = doc.y
    doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text(k, L, y, { width: 120 })
    doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(val, L + 125, y, { width: W - 125 })
    doc.y = Math.max(doc.y, y + 14)
  }

  /* en-tête */
  const lh = drawLogo(doc, L, 44, 120)
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.ink).text(TYPE_LABEL[job.type] ?? 'Rapport', L, 46, { width: W, align: 'right' })
  doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('Rapport scellé', L, 66, { width: W, align: 'right' })
  doc.moveTo(L, 44 + lh + 10).lineTo(L + W, 44 + lh + 10).lineWidth(2.5).strokeColor(C.teal).stroke()
  doc.y = 44 + lh + 22

  doc.font('Helvetica-Bold').fontSize(13).fillColor(C.ink).text(`${elevator.label} — ${site.name}`, L, doc.y)
  doc.font('Helvetica').fontSize(10).fillColor(C.muted).text(`${client.name} · ${site.address}`, L, doc.y + 2)
  doc.moveDown(0.8)

  kv('Appareil', `${elevator.brand ?? ''} ${elevator.model ?? ''} · n° ${elevator.serial ?? '—'} · ${elevator.year ?? ''}`.trim())
  kv('Date', `${dateFr(v.finishedAt)} à ${timeFr(v.finishedAt)} · ${v.minutes ?? 0} min`)
  kv('Technicien', tech?.name ?? '—')
  if (job.description) kv('Motif', `${job.description}${job.trapped ? ' (personne bloquée)' : ''}`)
  if (job.type === 'entretien') kv('Appel d’urgence', v.emergencyCallTest === 'ok' ? 'Conforme' : 'NON conforme')

  h2('Synthèse')
  doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(v.summary ?? '', L, doc.y, { width: W, lineGap: 2 })

  if (job.type === 'depannage' && Array.isArray(job.timeline) && job.timeline.length) {
    h2('Chronologie')
    for (const t of job.timeline) { need(16); const y = doc.y; doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.muted).text(timeFr(t.at), L, y, { width: 50 }); doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(t.label, L + 55, y, { width: W - 55 }); doc.y = Math.max(doc.y, y + 14) }
  }

  if (job.type === 'entretien') {
    h2('Points de contrôle')
    for (const z of ZONES) {
      need(40)
      const zy = doc.y + 4
      doc.rect(L, zy, W, 17).fill(C.bg)
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink).text(z.label, L + 6, zy + 4, { width: W - 12 })
      doc.y = zy + 19
      for (const it of z.items) {
        const a = v.checklist?.[it.key]
        const [lab, col] = a ? STATUS[a.status as keyof typeof STATUS] : (['Non contrôlé', C.muted] as const)
        const noteH = a?.note ? doc.heightOfString(a.note, { width: 150, fontSize: 8.5 } as never) : 0
        const h = Math.max(15, doc.heightOfString(it.label, { width: W - 250 }) + 4, noteH + 4)
        need(h)
        const y = doc.y
        doc.font('Helvetica').fontSize(9.5).fillColor(C.ink).text(it.label, L + 6, y + 2, { width: W - 250 })
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(col).text(lab, L + W - 240, y + 2, { width: 80 })
        if (a?.note) doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(a.note, L + W - 155, y + 2, { width: 150 })
        doc.y = y + h
        doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.4).strokeColor(C.line).stroke()
      }
    }
    const ms = Object.entries(v.measures ?? {}).filter(([, val]) => val !== '')
    if (ms.length) {
      h2('Mesures')
      doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(ms.map(([k, val]) => { const m = MEASURES.find((x) => x.key === k); return `${m?.label ?? k} : ${val} ${(m?.unit ?? '').replace('Ω', 'ohm')}` }).join('   ·   '), L, doc.y, { width: W })
    }
  }

  if (v.parts?.length) {
    h2('Pièces remplacées')
    for (const p of v.parts) { need(14); doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(`${p.qty} × ${p.name}`, L + 8, doc.y) }
  }
  if (defects.length) {
    h2('Défauts à lever')
    for (const df of defects) { need(28); doc.font('Helvetica-Bold').fontSize(9.5).fillColor(df.severity === 'critique' ? C.ko : C.watch).text(String(df.severity).toUpperCase(), L, doc.y, { continued: true }).font('Helvetica').fillColor(C.ink).text(`  ${df.title}  (avant le ${dateFr(df.due)})`, { width: W }) }
  }

  /* photos */
  const photos = Object.entries(v.checklist ?? {}).flatMap(([k, a]: [string, any]) => (a.photos ?? []).map((p: string) => ({ k, p })))
  const shots = photos.map((p) => ({ ...p, buf: decodeRef(p.p, files) })).filter((p) => p.buf)
  if (shots.length) {
    h2('Photos')
    const size = 118, gap = 12
    let col = 0
    let rowY = doc.y
    for (const s of shots) {
      if (col === 0) { if (rowY + size + 14 > bottom()) { doc.addPage(); rowY = doc.y } }
      const x = L + col * (size + gap)
      try { doc.image(s.buf as Buffer, x, rowY, { fit: [size, size], align: 'center', valign: 'center' }) } catch { doc.rect(x, rowY, size, size).strokeColor(C.line).stroke() }
      const label = ZONES.flatMap((z) => z.items).find((i) => i.key === s.k)?.label ?? (s.k === 'diag' ? 'Constat' : s.k)
      doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(label, x, rowY + size + 2, { width: size, height: 20 })
      col += 1
      if (col * (size + gap) + size > W) { col = 0; rowY += size + 28 }
    }
    doc.y = col === 0 ? rowY : rowY + size + 28
  }

  /* signature */
  h2('Signature')
  const sig: Doc = v.signature ?? {}
  if (sig.absent) {
    doc.font('Helvetica').fontSize(10).fillColor(C.ink).text('Client absent lors de la visite.', L, doc.y)
    const b = decodeRef(sig.photo, files)
    if (b) { need(110); try { doc.image(b, L, doc.y + 4, { fit: [160, 100] }); doc.y += 108 } catch { /* image illisible */ } }
  } else {
    doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(`${sig.name ?? ''} (${sig.role ?? ''})`, L, doc.y)
    const b = decodeRef(sig.dataUrl, files)
    if (b) { need(80); try { doc.image(b, L, doc.y + 4, { fit: [200, 70] }); doc.y += 78 } catch { /* image illisible */ } }
  }

  /* sceau */
  h2('Sceau d’intégrité')
  doc.font('Courier').fontSize(8).fillColor(C.muted).text(`SHA-256 : ${v.hash ?? '—'}`, L, doc.y, { width: W })
  doc.font('Helvetica').fontSize(9).fillColor(d.sealValid ? C.ok : C.ko).text(d.sealValid ? 'Le contenu de ce rapport est conforme au sceau enregistré à la clôture.' : 'ATTENTION : le contenu ne correspond pas au sceau enregistré.', L, doc.y + 4, { width: W })
  doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(`Consultation en ligne : ${d.appUrl}/#/report/${job.id}`, L, doc.y + 4, { width: W })

  /* pieds de page */
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc.page.margins.bottom = 0 // sinon écrire dans la marge basse ajoute une page vierge
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
    doc.text(`Maintix · ${elevator.label} · ${v.hash ? v.hash.slice(0, 12) : ''}`, L, doc.page.height - 38, { width: W / 2, lineBreak: false })
    doc.text(`Page ${i + 1} / ${range.count}`, L + W / 2, doc.page.height - 38, { width: W / 2, align: 'right', lineBreak: false })
  }
  doc.end()
  return done
}

export interface InvoiceData {
  invoice: Doc
  client: Doc
  settings?: Doc
  appUrl: string
  compress?: boolean
}
const eurFr = (n: number) => `${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} EUR`
const dFr = (d?: string) => (d ? d.split('-').reverse().join('/') : '—')

/** Facture PDF (A4). Montants recalculés par le serveur à partir des lignes. */
export function buildInvoicePdf(d: InvoiceData): Promise<Buffer> {
  const { invoice: inv, client, settings: org = {} } = d
  const t = totals({ lines: inv.lines ?? [], vatRate: Number(inv.vatRate ?? 20) })
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, compress: d.compress ?? true, info: { Title: `Facture ${inv.number ?? 'brouillon'}`, Author: String(org.legalName ?? 'Maintix') } })
  const chunks: Buffer[] = []
  doc.on('data', (b: Buffer) => chunks.push(b))
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))
  const L = 48
  const W = doc.page.width - 96

  const lh = drawLogo(doc, L, 44, 110)
  doc.font('Helvetica-Bold').fontSize(20).fillColor(C.ink).text(inv.status === 'brouillon' ? 'PROFORMA' : 'FACTURE', L, 44, { width: W, align: 'right' })
  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.teal).text(inv.number ?? 'Brouillon', L, 70, { width: W, align: 'right' })
  doc.moveTo(L, 44 + lh + 12).lineTo(L + W, 44 + lh + 12).lineWidth(2.5).strokeColor(C.teal).stroke()

  // émetteur / destinataire
  let y = 44 + lh + 28
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text(String(org.legalName ?? ''), L, y, { width: W / 2 - 10 })
  doc.font('Helvetica').fontSize(9).fillColor(C.muted).text([org.address, org.siret ? `SIRET ${org.siret}` : '', org.vatNumber ? `TVA ${org.vatNumber}` : '', org.email, org.phone].filter(Boolean).join('\n'), L, doc.y + 2, { width: W / 2 - 10 })
  const leftEnd = doc.y
  doc.rect(L + W / 2 + 10, y - 6, W / 2 - 10, 78).fill(C.bg)
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.muted).text('FACTURÉ À', L + W / 2 + 20, y, { width: W / 2 - 30 })
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink).text(String(client.name ?? ''), L + W / 2 + 20, doc.y + 2, { width: W / 2 - 30 })
  doc.font('Helvetica').fontSize(9).fillColor(C.muted).text([client.contact, client.email].filter(Boolean).join('\n'), L + W / 2 + 20, doc.y + 2, { width: W / 2 - 30 })
  y = Math.max(leftEnd, y + 78) + 18

  const meta: [string, string][] = [['Date d’émission', dFr(inv.issuedAt)], ['Échéance', dFr(inv.dueAt)]]
  if (inv.periodStart) meta.push(['Période', `${dFr(inv.periodStart)} – ${dFr(inv.periodEnd)}`])
  meta.forEach(([k, v], i) => {
    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(k, L + i * 170, y, { width: 160 })
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text(v, L + i * 170, y + 12, { width: 160 })
  })
  y += 40

  // lignes
  doc.rect(L, y, W, 20).fill(C.ink)
  const cols = { label: L + 8, qty: L + W - 230, unit: L + W - 160, total: L + W - 80 }
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff')
  doc.text('DÉSIGNATION', cols.label, y + 6, { width: 280 }).text('QTÉ', cols.qty, y + 6, { width: 50, align: 'right' }).text('PU HT', cols.unit, y + 6, { width: 70, align: 'right' }).text('TOTAL HT', cols.total, y + 6, { width: 72, align: 'right' })
  y += 24
  for (const l of inv.lines ?? []) {
    const h = Math.max(20, doc.font('Helvetica').fontSize(9.5).heightOfString(String(l.label), { width: 280 }) + 10)
    if (y + h > doc.page.height - 200) { doc.addPage(); y = 60 }
    doc.font('Helvetica').fontSize(9.5).fillColor(C.ink).text(String(l.label), cols.label, y + 4, { width: 280 })
    doc.text(String(l.qty).replace('.', ','), cols.qty, y + 4, { width: 50, align: 'right' }).text(eurFr(Number(l.unit)), cols.unit - 10, y + 4, { width: 80, align: 'right' }).text(eurFr(Math.round(l.qty * l.unit * 100) / 100), cols.total - 6, y + 4, { width: 78, align: 'right' })
    y += h
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.4).strokeColor(C.line).stroke()
  }

  // totaux
  y += 14
  if (y > doc.page.height - 190) { doc.addPage(); y = 60 }
  const tx = L + W - 220
  const trow = (k: string, v: string, bold = false) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(C.ink).text(k, tx, y, { width: 110 }).text(v, tx + 100, y, { width: 120, align: 'right' }); y += bold ? 22 : 16 }
  trow('Total HT', eurFr(t.ht))
  trow(`TVA ${String(inv.vatRate).replace('.', ',')} %`, eurFr(t.vat))
  doc.moveTo(tx, y).lineTo(tx + 220, y).lineWidth(1).strokeColor(C.teal).stroke(); y += 6
  trow('Total TTC', eurFr(t.ttc), true)
  if (inv.status === 'payee') { doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ok).text(`ACQUITTÉE le ${dFr(inv.paidAt)}`, tx, y, { width: 220, align: 'right' }); y += 20 }
  if (inv.status === 'annulee') { doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ko).text('ANNULÉE', tx, y, { width: 220, align: 'right' }); y += 20 }

  y += 10
  doc.font('Helvetica').fontSize(9).fillColor(C.ink)
  if (org.iban) { doc.font('Helvetica-Bold').text('Règlement par virement', L, y); doc.font('Helvetica').fillColor(C.muted).text(`IBAN ${org.iban}  ·  Référence : ${inv.number ?? ''}`, L, doc.y + 2, { width: W }); y = doc.y + 8 }
  if (inv.note) { doc.font('Helvetica').fontSize(9).fillColor(C.ink).text(String(inv.note), L, y, { width: W }); y = doc.y + 8 }
  if (org.legalFooter) doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(String(org.legalFooter), L, Math.max(y + 6, doc.page.height - 120), { width: W })

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc.page.margins.bottom = 0
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(`${String(org.legalName ?? 'Maintix')} · ${inv.number ?? ''}`, L, doc.page.height - 38, { width: W / 2, lineBreak: false })
    doc.text(`Page ${i + 1} / ${range.count}`, L + W / 2, doc.page.height - 38, { width: W / 2, align: 'right', lineBreak: false })
  }
  doc.end()
  return done
}
