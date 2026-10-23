import { serve } from '@hono/node-server'
import { resolve } from 'node:path'
import { createApp } from './app'
import { checkDatabaseUrl, loadConfig } from './config'
import { migrate, pgDb, pgliteDb } from './db'
import { consoleMailer, fileMailer, smtpMailer } from './mailer'
import { createErrorReporter, createLogger, Metrics, type Level } from './observability'
import { sweepSubscriptions } from './billing'
import { sendComplianceReminders } from './compliance'
import { loadNotifyConfig, Notifier, realChannels } from './notify'

const config = loadConfig()
const logger = createLogger((process.env.LOG_LEVEL as Level) || 'info')
const metrics = new Metrics()
if (config.databaseUrl) {
  const problem = checkDatabaseUrl(config.databaseUrl)
  if (problem) {
    console.error(`Configuration de la base invalide : ${problem}.`)
    process.exit(1)
  }
}
if (process.env.NODE_ENV === 'production' && !config.databaseUrl) {
  console.error('DATABASE_URL est obligatoire en production.')
  process.exit(1)
}
const db = config.databaseUrl ? pgDb(config.databaseUrl) : await pgliteDb()
if (!config.databaseUrl) console.warn('DATABASE_URL absent : base embarquée en mémoire (développement uniquement, données perdues à l’arrêt).')
const applied = await migrate(db, resolve(process.env.MIGRATIONS_DIR ?? 'migrations'))
if (applied.length) console.log('migrations appliquées :', applied.join(', '))

const mailer = process.env.MAIL_OUTBOX_FILE ? fileMailer(process.env.MAIL_OUTBOX_FILE) : config.smtpUrl ? smtpMailer(config.smtpUrl, config.mailFrom) : consoleMailer
if (!config.smtpUrl) console.warn('SMTP_URL absent : les liens de connexion sont écrits dans les logs.')

const notifyCfg = loadNotifyConfig()
const notifier = new Notifier(db, realChannels(notifyCfg), notifyCfg, (m, x) => console.warn('[notify]', m, x ?? ''))
if (!notifier.channels.pushEnabled) console.warn('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY absents : notifications push désactivées.')
if (!notifier.channels.smsEnabled) console.warn('SMS non configurés (SMS_PROVIDER) : alertes par SMS désactivées.')
const stopEscalation = notifier.start()
// échéances : suspension automatique des essais et abonnements échus (au démarrage puis toutes les heures)
const sweep = () => Promise.all([sendComplianceReminders(db, mailer, config).catch((e) => logger.log('error', 'compliance_failed', { error: String(e) })), sweepSubscriptions(db, mailer, config)]).then(([, r]) => r).then((r) => r.length && logger.log('info', 'auto_suspended', { orgs: r.map((o) => `${o.name}:${o.code}`) })).catch((e) => logger.log('error', 'sweep_failed', { error: String(e) }))
void sweep()
const sweepTimer = setInterval(sweep, 3600_000)
const app = createApp({ db, config, mailer, notifier, logger, metrics, metricsToken: process.env.METRICS_TOKEN || undefined, reportError: createErrorReporter(process.env.ERROR_WEBHOOK_URL), version: process.env.APP_VERSION })
serve({ fetch: app.fetch, port: config.port }, (i) => logger.log('info', 'listening', { port: i.port, version: process.env.APP_VERSION ?? 'dev' }))
process.on('unhandledRejection', (e) => logger.log('error', 'unhandledRejection', { error: String(e) }))
process.on('SIGTERM', async () => { stopEscalation(); clearInterval(sweepTimer); await db.close(); process.exit(0) })
