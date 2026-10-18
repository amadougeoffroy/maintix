import data from '../../brand/logo-data.json'

type Variant = 'color' | 'dark' | 'white'
const wm = data as unknown as Record<Variant, { viewBox: string; width: number; height: number; inner: string }>

/** Logo Maintix en SVG vectoriel. `auto` : version Gaine en thème clair, version fond sombre en thème sombre. */
export function Logo({ variant = 'auto', height = 28, className = '' }: { variant?: Variant | 'auto'; height?: number; className?: string }) {
  const one = (v: Variant, cls: string) => {
    const w = wm[v]
    return (
      <svg key={v} className={cls} viewBox={w.viewBox} height={height} width={(height * w.width) / w.height} role="img" aria-label="Maintix" dangerouslySetInnerHTML={{ __html: w.inner }} />
    )
  }
  if (variant !== 'auto') return <span className={`mx-logo ${className}`}>{one(variant, '')}</span>
  return (
    <span className={`mx-logo ${className}`}>
      {one('color', 'on-light')}
      {one('dark', 'on-dark')}
    </span>
  )
}
