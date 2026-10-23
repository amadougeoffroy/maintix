/** Rappels par e-mail des échéances réglementaires des appareils (contrôle technique, assurance…) : 30 jours, 7 jours, dépassée. */
import type { Config } from './config'
import type { Db } from './db'
import { emailParts } from './emailTemplate'
import type { Mailer } from './mailer'
import { todayStr } from './billing'

const KIND_LABEL: Record<string, string> = { controle_technique: 'Contrôle technique', assurance: 'Assurance', extincteur: 'Extincteur', autre: 'Échéance' }
const dFr = (d: string) => d.split('-').reverse().join('/')

export async function sendComplianceReminders(db: Db, mailer: Mailer, config: Config, today = todayStr()) {
  const due = (await db.query<{ org_id: string; org: string; elevator_id: string; elevator: string; item_id: string; label: string; kind: string; due: string; days: number }>(
    `select d.org_id, o.name as org, d.id as elevator_id, coalesce(d.data->>'label', d.id) as elevator, c->>'id' as item_id, coalesce(c->>'label', 'Échéance') as label,
            coalesce(c->>'kind', 'autre') as kind, c->>'due' as due, ((c->>'due')::date - $1::date)::int as days
       from docs d join organisations o on o.id = d.org_id,
            jsonb_array_elements(case when jsonb_typeof(d.data->'compliance') = 'array' then d.data->'compliance' else '[]'::jsonb end) c
      where d.collection = 'elevators' and not d.deleted and o.kind = 'client' and o.status = 'active'
        and c->>'due' ~ '^\\d{4}-\\d{2}-\\d{2}$' and (c->>'due')::date - $1::date <= 30
      order by d.org_id, (c->>'due')::date`, [today],
  )).rows
  const byOrg = new Map<string, { org: string; lines: { title: string; text: string }[] }>()
  for (const r of due) {
    const step = r.days < 0 ? 'over' : r.days <= 7 ? 'd7' : 'd30'
    const fresh = (await db.query(`insert into compliance_reminders (org_id, elevator_id, item_id, due, kind) values ($1,$2,$3,$4,$5) on conflict do nothing returning org_id`, [r.org_id, r.elevator_id, r.item_id, r.due, step])).rows.length
    if (!fresh) continue
    const when = r.days < 0 ? `dépassée de ${-r.days} jour${-r.days > 1 ? 's' : ''}` : r.days === 0 ? 'aujourd’hui' : `dans ${r.days} jour${r.days > 1 ? 's' : ''}`
    const g = byOrg.get(r.org_id) ?? { org: r.org, lines: [] }
    g.lines.push({ title: `${r.label} · ${r.elevator}`, text: `${KIND_LABEL[r.kind] ?? 'Échéance'} : échéance ${dFr(r.due)}, ${when}` })
    byOrg.set(r.org_id, g)
  }
  const sent: { org: string; count: number }[] = []
  for (const [orgId, g] of byOrg) {
    const to = (await db.query<{ email: string; full_name: string }>(`select u.email, m.full_name from members m join users u on u.id = m.user_id where m.org_id = $1 and m.role in ('admin', 'bureau')`, [orgId])).rows
    const late = g.lines.some((l) => l.text.includes('dépassée'))
    for (const a of to) {
      await mailer.send({
        to: a.email,
        subject: `${late ? 'Échéance dépassée' : 'Échéances à venir'} : ${g.lines.length} appareil${g.lines.length > 1 ? 's' : ''} concerné${g.lines.length > 1 ? 's' : ''}`,
        ...emailParts({
          preheader: g.lines[0]?.title,
          title: `Bonjour ${a.full_name},`,
          paragraphs: [late ? 'Des échéances réglementaires de votre parc sont dépassées ou arrivent à terme :' : 'Des échéances réglementaires de votre parc arrivent bientôt :'],
          bullets: g.lines.slice(0, 15),
          button: { label: 'Voir les échéances', url: `${config.appUrl}/#/office/compliance` },
          notes: g.lines.length > 15 ? [`… et ${g.lines.length - 15} autre(s) échéance(s).`] : [],
        }),
      }).catch(() => {})
    }
    sent.push({ org: g.org, count: g.lines.length })
  }
  return sent
}
