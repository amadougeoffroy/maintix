/** JSON canonique (clés triées) : stable après un passage par jsonb, qui ne conserve pas l'ordre des clés. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`
}

/** Données couvertes par le sceau d'un rapport clôturé. */
export function sealPayload(job: { id: string; elevatorId: string; visit?: Record<string, unknown> }): string {
  const { hash: _h, summary, sentAt: _s, ...rest } = (job.visit ?? {}) as Record<string, unknown>
  void _h
  void _s
  return canonicalJson({ id: job.id, elevator: job.elevatorId, visit: rest, summary })
}
