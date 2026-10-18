/** Chiffrement des secrets de plateforme (clés API de paiement) stockés en base : AES-256-GCM.
 *  Clé : SECRETS_KEY (recommandé, hors base). Sans elle, une clé aléatoire est générée et conservée en base (protège des
 *  sauvegardes en clair d'un champ, pas d'un accès complet à la base). */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { Db } from './db'

async function masterKey(db: Db, secretsKey?: string): Promise<Buffer> {
  if (secretsKey) return createHash('sha256').update(secretsKey).digest()
  const row = (await db.query<{ value: string }>(`select value from platform_settings where key = 'master_key'`)).rows[0]
  if (row) return Buffer.from(row.value, 'base64')
  const k = randomBytes(32)
  await db.query(`insert into platform_settings (key, value) values ('master_key', $1) on conflict do nothing`, [k.toString('base64')])
  const again = (await db.query<{ value: string }>(`select value from platform_settings where key = 'master_key'`)).rows[0]
  return Buffer.from(again.value, 'base64')
}

export async function encryptSecret(db: Db, secretsKey: string | undefined, plain: string): Promise<string> {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', await masterKey(db, secretsKey), iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`
}

export async function decryptSecret(db: Db, secretsKey: string | undefined, token: string): Promise<string | null> {
  const [v, iv, tag, data] = token.split(':')
  if (v !== 'v1' || !iv || !tag || !data) return null
  try {
    const d = createDecipheriv('aes-256-gcm', await masterKey(db, secretsKey), Buffer.from(iv, 'base64'))
    d.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8')
  } catch { return null } // clé changée ou donnée altérée
}

export const SETTING_KEYS = ['jeko.apiKey', 'jeko.apiKeyId', 'jeko.storeId', 'jeko.webhookSecret'] as const
export type SettingKey = (typeof SETTING_KEYS)[number]
const SECRET: Record<SettingKey, boolean> = { 'jeko.apiKey': true, 'jeko.apiKeyId': false, 'jeko.storeId': false, 'jeko.webhookSecret': true }

export async function setSetting(db: Db, secretsKey: string | undefined, key: SettingKey, value: string) {
  const stored = SECRET[key] ? await encryptSecret(db, secretsKey, value) : value
  await db.query(`insert into platform_settings (key, value, secret) values ($1,$2,$3) on conflict (key) do update set value = excluded.value, secret = excluded.secret, updated_at = now()`, [key, stored, SECRET[key]])
}
export const clearSetting = (db: Db, key: SettingKey) => db.query('delete from platform_settings where key = $1', [key])

export async function getSettings(db: Db, secretsKey: string | undefined): Promise<Partial<Record<SettingKey, string>>> {
  const rows = (await db.query<{ key: string; value: string; secret: boolean }>(`select key, value, secret from platform_settings where key like 'jeko.%'`)).rows
  const out: Partial<Record<SettingKey, string>> = {}
  for (const r of rows) {
    const v = r.secret ? await decryptSecret(db, secretsKey, r.value) : r.value
    if (v) out[r.key as SettingKey] = v
  }
  return out
}
