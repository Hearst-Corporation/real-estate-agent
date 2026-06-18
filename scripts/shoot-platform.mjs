import { chromium } from '@playwright/test'
import { SignJWT } from 'jose'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = 'http://localhost:3002'
const ADMIN_ID = '9717aa27-d844-4221-ab2e-c277b93d77ca'
const EMAIL = 'admin@real-estate-agent.app'
const OUT = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

// --- charge .env.local ---
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[t.slice(0, i).trim()] = v
}
const TENANT = env.TENANT_ID || env.NEXT_PUBLIC_TENANT_ID || 'real-estate-agent'
const key = new TextEncoder().encode(env.JWT_SECRET)
const now = Math.floor(Date.now() / 1000)
// token sans jti -> check de révocation sauté (rétro-compat legacy)
const token = await new SignJWT({ sub: ADMIN_ID, email: EMAIL, tenant_id: TENANT, role: 'admin', scope: ['*'] })
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setIssuedAt(now)
  .setExpirationTime(now + 3600)
  .sign(key)

const PAGES = [
  ['/', '01-accueil'],
  ['/properties', '02-portefeuille'],
  ['/leads', '03-clients'],
  ['/estimations', '04-estimations'],
  ['/estimations/new', '05-estimation-nouvelle'],
  ['/agenda', '06-agenda'],
  ['/prospection', '07-prospection'],
  ['/missions', '08-missions'],
  ['/swarms', '09-swarms'],
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await ctx.addCookies([{ name: 'real_estate_agent_token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }])
const page = await ctx.newPage()

// sanity: la home ne doit PAS rediriger vers /auth
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
console.log('after home, url =', page.url())

const done = []
for (const [route, name] of PAGES) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(1800)
    await page.screenshot({ path: `${OUT}/${name}.png` })
    done.push(name)
    console.log('OK', route, '->', page.url())
  } catch (e) {
    console.log('SKIP', route, e.message)
  }
}
await browser.close()
console.log('DONE:', done.join(','))
