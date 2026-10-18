import { describe, expect, it } from 'vitest'
import { checkDatabaseUrl, databaseUrlFrom, loadConfig } from '../src/config'

describe('adresse de la base', () => {
  it('encode un mot de passe contenant des caractères spéciaux', () => {
    const pass = 'a/b+c=d@e#f?g:h%i j'
    const url = databaseUrlFrom({ DB_HOST: 'db', DB_USER: 'cabine', DB_PASSWORD: pass, DB_NAME: 'cabine' })!
    expect(checkDatabaseUrl(url)).toBeNull()
    const u = new URL(url)
    expect(decodeURIComponent(u.password)).toBe(pass)
    expect(u.hostname).toBe('db')
    expect(u.pathname).toBe('/cabine')
    expect(u.port).toBe('5432')
  })
  it('DATABASE_URL a la priorité, DB_* sert de repli, rien sinon', () => {
    expect(databaseUrlFrom({ DATABASE_URL: 'postgres://u:p@h/d', DB_HOST: 'autre' })).toBe('postgres://u:p@h/d')
    expect(databaseUrlFrom({ DB_HOST: 'h', DB_PASSWORD: 'x', DB_PORT: '6543' })).toContain('@h:6543/')
    expect(databaseUrlFrom({})).toBeUndefined()
    expect(loadConfig({ APP_URL: 'https://x.test', DB_HOST: 'db', DB_PASSWORD: 'p' }).databaseUrl).toContain('@db:5432/')
  })
  it('détecte une adresse illisible sans divulguer le mot de passe', () => {
    const bad = 'postgres://cabine:SECRET/avec+slash=@db:5432/cabine'
    const msg = checkDatabaseUrl(bad)
    expect(msg).toContain('caractères spéciaux')
    expect(msg).not.toContain('SECRET')
    expect(checkDatabaseUrl('mysql://u:p@h/d')).toContain('postgres://')
    expect(checkDatabaseUrl('postgres://u:p@h/d')).toBeNull()
  })
})
