// Commandes d'administration, à lancer depuis le serveur :
//   docker exec <conteneur app> node dist/cli.js login-link ada@exemple.fr
import { resolve } from 'node:path'
import { createLoginToken } from './auth'
import { checkDatabaseUrl, loadConfig } from './config'
import { migrate, pgDb, type Db } from './db'

/** Crée un lien de connexion (15 min, usage unique) pour un membre existant. Renvoie null si l'adresse est inconnue. */
export async function loginLinkFor(db: Db, appUrl: string, email: string): Promise<string | null> {
  const u = await db.query<{ id: string }>('select u.id from users u join members m on m.user_id = u.id where u.email = $1 limit 1', [email.trim().toLowerCase()])
  if (!u.rows[0]) return null
  return `${appUrl.replace(/\/$/, '')}/#/auth?token=${await createLoginToken(db, u.rows[0].id)}`
}

/** Donne l'accès à la console opérateur à un utilisateur existant. */
export async function makeOperator(db: Db, email: string): Promise<boolean> {
  const u = await db.query<{ id: string }>('select id from users where email = $1', [email.trim().toLowerCase()])
  if (!u.rows[0]) return false
  await db.query('insert into operators (user_id) values ($1) on conflict do nothing', [u.rows[0].id])
  return true
}

async function main() {
  const [cmd, email] = process.argv.slice(2)
  if (!['login-link', 'operator-add'].includes(cmd) || !email) {
    console.error('Usage : node dist/cli.js login-link <e-mail>   |   node dist/cli.js operator-add <e-mail>')
    process.exit(2)
  }
  const config = loadConfig()
  if (!config.databaseUrl) { console.error('Base de données non configurée (DATABASE_URL ou DB_HOST…).'); process.exit(1) }
  const problem = checkDatabaseUrl(config.databaseUrl)
  if (problem) { console.error(`Configuration de la base invalide : ${problem}.`); process.exit(1) }
  const db = pgDb(config.databaseUrl)
  try {
    await migrate(db, resolve(process.env.MIGRATIONS_DIR ?? 'migrations'))
    if (cmd === 'operator-add') {
      const ok = await makeOperator(db, email)
      if (!ok) { console.error(`Aucun utilisateur avec l'adresse ${email} : il doit d'abord être membre d'une entreprise.`); process.exit(1) }
      console.log(`${email} est maintenant opérateur de la plateforme (console : ${config.appUrl}/#/operator).`)
      return
    }
    const link = await loginLinkFor(db, config.appUrl, email)
    if (!link) { console.error(`Aucun membre avec l'adresse ${email}. Vérifiez l'orthographe, ou créez l'entreprise sur /#/setup.`); process.exit(1) }
    console.log(`Lien de connexion (valable 15 minutes, à usage unique) :\n${link}`)
  } finally {
    await db.close()
  }
}

// exécuté en ligne de commande uniquement (pas lors d'un import, par exemple dans les tests)
if (process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts')) void main()
