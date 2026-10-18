/** Photos et signatures. En mode serveur : stockées par empreinte SHA-256 (`file:<hash>`), envoyées en arrière-plan.
 *  En mode local (démo) : les images restent en data-URL dans le document. */
import { useEffect, useState } from 'react'
import { del, get, set } from 'idb-keyval'
import { runtime } from './store'
import { sha256Bytes } from './util'

const BLOB_PREFIX = 'cabine-blob:'
const PENDING_KEY = 'cabine-blob-pending'
export const isFileRef = (v: string | undefined): v is string => !!v && v.startsWith('file:')

async function pendingList(): Promise<string[]> {
  return (await get<string[]>(PENDING_KEY).catch(() => undefined)) ?? []
}

/** Enregistre un blob et renvoie sa référence (ou une data-URL en mode local). */
export async function saveBlob(blob: Blob): Promise<string> {
  if (!runtime.server) return blobToDataUrl(blob)
  const hash = await sha256Bytes(await blob.arrayBuffer())
  await set(BLOB_PREFIX + hash, blob)
  const pending = await pendingList()
  if (!pending.includes(hash)) await set(PENDING_KEY, [...pending, hash])
  return `file:${hash}`
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(r.error)
    r.onload = () => resolve(r.result as string)
    r.readAsDataURL(blob)
  })

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}
/** Convertit une data-URL (signature, photo) en référence. */
export async function saveDataUrl(dataUrl: string): Promise<string> {
  return runtime.server ? saveBlob(await dataUrlToBlob(dataUrl)) : dataUrl
}

/** Envoie au serveur les fichiers en attente. Lève une erreur réseau pour que la synchro réessaie plus tard. */
export async function flushBlobs(): Promise<void> {
  for (const hash of await pendingList()) {
    const blob = await get<Blob>(BLOB_PREFIX + hash)
    if (!blob) { await set(PENDING_KEY, (await pendingList()).filter((h) => h !== hash)); continue }
    const res = await fetch(`/api/files/${hash}`, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': blob.type || 'image/jpeg' }, body: blob })
    if (res.status === 401) throw Object.assign(new Error('401'), { status: 401 })
    if (!res.ok && res.status !== 413 && res.status !== 415) throw new Error(`upload ${res.status}`)
    await set(PENDING_KEY, (await pendingList()).filter((h) => h !== hash))
  }
}
export const pendingBlobCount = async () => (await pendingList()).length

/** Efface les fichiers locaux (déconnexion). */
export async function wipeBlobs() {
  for (const h of await pendingList()) await del(BLOB_PREFIX + h).catch(() => {})
  await del(PENDING_KEY).catch(() => {})
}

const cache = new Map<string, string>()
/** URL affichable pour une référence : copie locale, sinon téléchargement puis mise en cache locale. */
export function useImageSrc(ref: string | undefined): string | undefined {
  const [src, setSrc] = useState<string | undefined>(() => (ref && !isFileRef(ref) ? ref : ref ? cache.get(ref) : undefined))
  useEffect(() => {
    if (!ref) return setSrc(undefined)
    if (!isFileRef(ref)) return setSrc(ref)
    const hit = cache.get(ref)
    if (hit) return setSrc(hit)
    let alive = true
    ;(async () => {
      const hash = ref.slice(5)
      let blob = await get<Blob>(BLOB_PREFIX + hash).catch(() => undefined)
      if (!blob) {
        try {
          const res = await fetch(`/api/files/${hash}`, { credentials: 'same-origin' })
          if (res.ok) { blob = await res.blob(); await set(BLOB_PREFIX + hash, blob).catch(() => {}) }
        } catch { /* hors ligne : l'image s'affichera quand le réseau reviendra */ }
      }
      if (blob && alive) { const url = URL.createObjectURL(blob); cache.set(ref, url); setSrc(url) }
    })()
    return () => { alive = false }
  }, [ref])
  return src
}
