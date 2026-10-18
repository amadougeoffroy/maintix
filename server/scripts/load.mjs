#!/usr/bin/env node
// Test de charge : N techniciens synchronisent des missions pendant D secondes.
//   node scripts/load.mjs --url http://localhost:8790 --bootstrap-token T --mail-file /tmp/mails.jsonl --users 30 --seconds 30
// Le serveur doit tourner avec MAIL_OUTBOX_FILE (même fichier) pour que le script lise les liens de connexion.
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const URL_ = arg('url', 'http://localhost:8787')
const TOKEN = arg('bootstrap-token', '')
const MAIL = arg('mail-file', '')
const USERS = Number(arg('users', 20))
const SECONDS = Number(arg('seconds', 20))
const THRESH_P95 = Number(arg('p95-ms', 500))
if (!TOKEN || !MAIL) { console.error('--bootstrap-token et --mail-file sont requis'); process.exit(2) }

const lat = new Map()
let errors = 0, total = 0
const rec = (name, ms, ok) => { total++; if (!ok) errors++; (lat.get(name) ?? lat.set(name, []).get(name)).push(ms) }
let ipn = 0
const ip = () => `10.0.${Math.floor(ipn / 250)}.${ipn++ % 250}` // une adresse par utilisateur : évite la limitation de débit par IP

async function call(name, path, { method = 'GET', body, cookie, headers = {}, raw } = {}, xff) {
  const t = performance.now()
  let ok = false, res
  try {
    res = await fetch(URL_ + path, { method, headers: { origin: URL_, 'x-forwarded-for': xff, ...(cookie ? { cookie } : {}), ...(body && !raw ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) })
    ok = res.status < 400
  } catch { /* erreur réseau */ }
  rec(name, performance.now() - t, ok)
  return res
}
const mails = () => readFileSync(MAIL, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
async function loginAs(email, xff) {
  await call('auth.request-link', '/api/auth/request-link', { method: 'POST', body: { email } }, xff)
  let token
  for (let i = 0; i < 50 && !token; i++) { token = [...mails()].reverse().find((m) => [m.to].flat().includes(email))?.text.match(/token=([\w-]+)/)?.[1]; if (!token) await new Promise((r) => setTimeout(r, 100)) }
  const res = await call('auth.verify', '/api/auth/verify', { method: 'POST', body: { token } }, xff)
  return { cookie: res.headers.get('set-cookie').split(';')[0], info: await res.json() }
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0 }

console.log(`Charge : ${USERS} techniciens, ${SECONDS} s, cible ${URL_}`)
const adminXff = ip()
await call('bootstrap', '/api/bootstrap', { method: 'POST', body: { orgName: 'Charge SA', adminEmail: 'admin@charge.test', adminName: 'Admin Charge' }, headers: { 'x-bootstrap-token': TOKEN } }, adminXff)
const admin = await loginAs('admin@charge.test', adminXff)

// jeu de données : 1 client, 20 sites, 100 appareils
const ops = [{ collection: 'clients', id: 'c1', data: { id: 'c1', name: 'Client charge' } }]
for (let s = 0; s < 20; s++) ops.push({ collection: 'sites', id: `s${s}`, data: { id: `s${s}`, clientId: 'c1', name: `Site ${s}`, address: 'x' } })
for (let e = 0; e < 100; e++) ops.push({ collection: 'elevators', id: `e${e}`, data: { id: `e${e}`, siteId: `s${e % 20}`, label: `Asc ${e}`, status: 'ok' } })
await call('sync.push(seed)', '/api/sync/push', { method: 'POST', body: { ops }, cookie: admin.cookie }, adminXff)

// techniciens
const techs = []
for (let i = 0; i < USERS; i++) {
  const x = ip()
  await call('members.invite', '/api/members', { method: 'POST', cookie: admin.cookie, body: { email: `tech${i}@charge.test`, fullName: `Tech ${i}`, role: 'tech' } }, adminXff)
  const t = await loginAs(`tech${i}@charge.test`, x)
  techs.push({ ...t, xff: x, jobs: [], cursor: 0 })
}
// 10 missions par technicien, créées par le bureau
const jobOps = []
techs.forEach((t, i) => { for (let j = 0; j < 10; j++) { const id = `j${i}_${j}`; t.jobs.push(id); jobOps.push({ collection: 'jobs', id, data: { id, type: 'entretien', elevatorId: `e${(i * 10 + j) % 100}`, techId: t.info.techId, date: '2026-01-01', status: 'planifiee', createdAt: new Date().toISOString(), timeline: [] } }) } })
for (let i = 0; i < jobOps.length; i += 100) await call('sync.push(jobs)', '/api/sync/push', { method: 'POST', body: { ops: jobOps.slice(i, i + 100) }, cookie: admin.cookie }, adminXff)

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
const end = Date.now() + SECONDS * 1000
const worker = async (t) => {
  let step = 0
  while (Date.now() < end) {
    const jobId = t.jobs[step % t.jobs.length]
    const status = ['en_route', 'sur_place'][Math.floor(step / t.jobs.length) % 2]
    await call('sync.push(job)', '/api/sync/push', { method: 'POST', cookie: t.cookie, body: { ops: [{ collection: 'jobs', id: jobId, data: { id: jobId, type: 'entretien', elevatorId: 'e1', techId: t.info.techId, date: '2026-01-01', status, createdAt: 'x', timeline: [{ at: new Date().toISOString(), label: `étape ${step}` }], visit: { checklist: {}, notes: 'x'.repeat(200) } } }] } }, t.xff)
    const pull = await call('sync.pull', `/api/sync/pull?since=${t.cursor}&limit=300`, { cookie: t.cookie }, t.xff)
    if (pull?.ok) { const j = await pull.json(); t.cursor = j.cursor }
    if (step % 5 === 0) { const data = Buffer.concat([png, Buffer.from(randomUUID())]); await call('files.put', `/api/files/${createHash('sha256').update(data).digest('hex')}`, { method: 'PUT', cookie: t.cookie, raw: data, headers: { 'content-type': 'image/png' } }, t.xff) }
    step++
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200))
  }
}
const adminWorker = async () => { while (Date.now() < end) { await call('admin.pull', '/api/sync/pull?since=0&limit=500', { cookie: admin.cookie }, adminXff); await call('health.ready', '/api/health/ready', {}, adminXff); await new Promise((r) => setTimeout(r, 1000)) } }
const t0 = Date.now()
await Promise.all([...techs.map(worker), adminWorker()])
const dur = (Date.now() - t0) / 1000

console.log('\nrequête'.padEnd(22), 'n'.padStart(6), 'p50'.padStart(8), 'p95'.padStart(8), 'p99'.padStart(8), 'max'.padStart(8))
let worstP95 = 0
for (const [name, a] of [...lat].sort()) {
  if (name.startsWith('auth.') || name.startsWith('members') || name === 'bootstrap' || name.includes('(seed)') || name.includes('(jobs)')) continue
  const p95 = pct(a, 95); worstP95 = Math.max(worstP95, p95)
  console.log(name.padEnd(22), String(a.length).padStart(6), pct(a, 50).toFixed(0).padStart(7) + 'ms', p95.toFixed(0).padStart(7) + 'ms', pct(a, 99).toFixed(0).padStart(7) + 'ms', Math.max(...a).toFixed(0).padStart(7) + 'ms')
}
console.log(`\n${total} requêtes en ${dur.toFixed(1)} s (${(total / dur).toFixed(0)} req/s), erreurs : ${errors}`)
const ok = errors === 0 && worstP95 <= THRESH_P95
console.log(ok ? `OK : aucune erreur, p95 max ${worstP95.toFixed(0)} ms <= ${THRESH_P95} ms` : `ÉCHEC : ${errors} erreur(s), p95 max ${worstP95.toFixed(0)} ms (seuil ${THRESH_P95} ms)`)
process.exit(ok ? 0 : 1)
