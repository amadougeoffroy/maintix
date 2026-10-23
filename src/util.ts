export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`
export const iso = (d: Date) => d.toISOString()
export const today = () => new Date().toISOString().slice(0, 10)
export const addDays = (date: string, n: number) => {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
export const addMonths = (date: string, n: number) => {
  const d = new Date(date + 'T12:00:00')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
export const weekStart = (date: string) => {
  const d = new Date(date + 'T12:00:00')
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}
export const fmtDate = (d: string) =>
  new Date(d.length > 10 ? d : d + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
export const fmtDateLong = (d: string) =>
  new Date(d.length > 10 ? d : d + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
export const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
/** Montant en francs CFA : pas de centimes, séparateur de milliers (ex. 1 250 000 FCFA). */
export const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`

export async function sha256Bytes(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function compressImage(file: File, maxW = 1280, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('image'))
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width)
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * scale)
        c.height = Math.round(img.height * scale)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/** Télécharge un contenu texte sous forme de fichier. */
export function downloadText(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
