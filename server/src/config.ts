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
    databaseUrl: env.DATABASE_URL || undefined,
    vapidPublicKey: env.VAPID_PUBLIC_KEY || undefined,
  }
}
