export interface Config {
  appUrl: string
  port: number
  bootstrapToken?: string
  secureCookies: boolean
  staticDir?: string
  trustProxy: boolean
  mailFrom: string
  smtpUrl?: string
  databaseUrl?: string
  vapidPublicKey?: string
}

/** Adresse de la base : DATABASE_URL, sinon construite depuis DB_HOST/DB_USER/DB_PASSWORD/DB_NAME avec encodage du mot de passe
 *  (un mot de passe contenant / + = @ # casserait une URL écrite à la main). */
export function databaseUrlFrom(env: NodeJS.ProcessEnv): string | undefined {
  if (env.DATABASE_URL) return env.DATABASE_URL
  if (!env.DB_HOST) return undefined
  const enc = encodeURIComponent
  return `postgres://${enc(env.DB_USER ?? 'postgres')}:${enc(env.DB_PASSWORD ?? '')}@${env.DB_HOST}:${env.DB_PORT ?? '5432'}/${enc(env.DB_NAME ?? 'postgres')}`
}

/** Vérifie qu'une adresse de base est exploitable et renvoie un message clair sinon (sans afficher le mot de passe). */
export function checkDatabaseUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (!['postgres:', 'postgresql:'].includes(u.protocol)) return 'le protocole doit être postgres://'
    if (!u.hostname) return 'hôte manquant'
    return null
  } catch {
    return 'adresse illisible : si le mot de passe contient des caractères spéciaux (/ + = @ # ?), encodez-le ou utilisez DB_HOST, DB_USER, DB_PASSWORD et DB_NAME'
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const appUrl = (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
  return {
    appUrl,
    port: Number(env.PORT ?? 8787),
    bootstrapToken: env.BOOTSTRAP_TOKEN || undefined,
    secureCookies: appUrl.startsWith('https://'),
    staticDir: env.STATIC_DIR || undefined,
    trustProxy: env.TRUST_PROXY !== '0',
    mailFrom: env.MAIL_FROM ?? 'Maintix <no-reply@localhost>',
    smtpUrl: env.SMTP_URL || undefined,
    databaseUrl: databaseUrlFrom(env),
    vapidPublicKey: env.VAPID_PUBLIC_KEY || undefined,
  }
}
