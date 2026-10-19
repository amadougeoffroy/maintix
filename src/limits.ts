import { api } from './api'
import { feedback } from './feedback'
import { runtime } from './store'
import { fcfa } from './util'

const KIND = { techs: { one: 'technicien', many: 'techniciens' }, elevators: { one: 'appareil', many: 'appareils' } } as const

/** Vérifie un ajout au regard des plafonds de l'offre. Renvoie le nombre d'éléments qu'on peut ajouter (0 = rien).
 *  Offre « bloquante » : au-delà du plafond, l'ajout est refusé (le serveur applique la même règle). Offre « facturée » : on prévient, l'ajout reste possible. */
export async function guardAdd(kind: 'techs' | 'elevators', adding = 1): Promise<number> {
  if (!runtime.server) return adding
  let p: Awaited<ReturnType<typeof api.orgPlan>>
  try { p = await api.orgPlan() } catch { return adding } // en cas d'échec, le serveur tranchera
  const max = kind === 'techs' ? p.offer.maxTechs : p.offer.maxElevators
  const used = kind === 'techs' ? p.usage.techs : p.usage.elevators
  if (max === null || used + adding <= max) return adding
  const label = KIND[kind]
  if (p.offer.overageMode === 'block') {
    const room = Math.max(0, max - used)
    if (room === 0) limitDialog(kind, max)
    return Math.min(room, adding)
  }
  const extra = (used + adding - max) * (kind === 'techs' ? p.offer.extraTechPrice : p.offer.extraElevatorPrice)
  feedback.toast(`Votre offre inclut ${max} ${label.many} : cet ajout est facturé en supplément${extra > 0 ? ` (${fcfa(extra)} par mois au total pour le dépassement)` : ''}.`, 'info')
  return adding
}

/** Message d'erreur : plafond atteint, avec accès direct au changement d'offre. */
export function limitDialog(kind: 'techs' | 'elevators', max: number | null) {
  const label = KIND[kind]
  feedback.dialog({
    tone: 'error',
    title: 'Limite de votre offre atteinte',
    body: `Votre offre permet ${max ?? 'un nombre limité de'} ${label.many}${max === null ? '' : ' et ce plafond est atteint'}. Pour ajouter un ${label.one} de plus, passez à une offre supérieure.`,
    actions: [{ label: 'Changer d’offre', primary: true, to: '/office/settings/abonnement' }, { label: 'Fermer' }],
  })
}
