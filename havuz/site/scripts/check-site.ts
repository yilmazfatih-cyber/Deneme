/**
 * Derleme sonrası kalite denetimi. `npm run check` içinde çalışır.
 * Siteyi İKİ kez derler ve her derlemeyi baştan sona denetler (scripts/audit/):
 *   1. kök adres        → dist/      (SITE_URL/SITE_BASE ne ise o; varsayılan: site.config.ts → url)
 *   2. alt klasör       → dist-alt/  (SITE_BASE=/alt/klasor/; form ve bülten uç noktaları örnek adreslerle açık)
 * İkinci derleme, GitHub Pages gibi alt klasörde yayında kırık bağlantı kalmadığını kanıtlar.
 *
 *   node scripts/check-site.ts               derle + denetle (ikisi için)
 *   node scripts/check-site.ts --no-build    yalnız denetle (var olan dist/ ve dist-alt/ üzerinde)
 *   node scripts/check-site.ts --build-only  yalnız derle (uçtan uca testler için)
 *   node scripts/check-site.ts --root-only   yalnız kök adres derlemesi
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { loadEnv } from 'vite'
import { resolveDeployTarget } from '../src/lib/deploy.ts'
import { defaultLocale, locales, siteConfig } from '../src/site.config.ts'
import { auditSite } from './audit/audit.ts'
import { BUDGET, formatKb } from './audit/budget.ts'

export const ALT_BASE = '/alt/klasor/'

interface Target {
  label: string
  outDir: string
  env: Record<string, string>
}

const args = new Set(process.argv.slice(2))
const root = process.cwd()
const baseEnv: Record<string, string | undefined> = { ...loadEnv('production', root, ''), ...process.env }

const targets: Target[] = [
  { label: 'kök adres', outDir: 'dist', env: {} as Record<string, string> },
  {
    label: `alt klasör (${ALT_BASE})`,
    outDir: 'dist-alt',
    env: {
      SITE_BASE: ALT_BASE,
      PUBLIC_FORM_ENDPOINT: 'https://form.example/gonder',
      PUBLIC_NEWSLETTER_ENDPOINT: 'https://bulten.example/abone',
    },
  },
].slice(0, args.has('--root-only') ? 1 : 2)

function build(target: Target): void {
  const astro = path.join(
    path.dirname(createRequire(import.meta.url).resolve('astro/package.json')),
    'bin',
    'astro.mjs',
  )
  console.log(`\n▶ Derleniyor: ${target.label} → ${target.outDir}/`)
  const started = Date.now()
  const result = spawnSync(process.execPath, [astro, 'build', '--outDir', target.outDir], {
    cwd: root,
    env: { ...process.env, ...target.env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) {
    console.error(result.stdout)
    console.error(result.stderr)
    console.error(`\n✗ Derleme başarısız (${target.label}). Yukarıdaki ilk hata iletisine bakın.`)
    process.exit(1)
  }
  console.log(`  ✓ Derlendi (${((Date.now() - started) / 1000).toFixed(1)} sn)`)
}

async function audit(target: Target): Promise<number> {
  const outDir = path.join(root, target.outDir)
  if (!existsSync(outDir)) {
    console.error(`✗ ${target.outDir}/ yok. Önce derleyin: node scripts/check-site.ts`)
    return 1
  }
  const { site, base } = resolveDeployTarget({ ...baseEnv, ...target.env }, siteConfig.url)
  const result = await auditSite({
    root: outDir,
    site,
    base,
    defaultLang: siteConfig.locales[defaultLocale].lang,
    prefixedLangs: locales.filter((locale) => locale !== defaultLocale),
  })
  console.log(`\n▶ Denetleniyor: ${target.outDir}/ — ${result.pages} sayfa, adres ${site}${base}`)
  const { html, css, js } = result.heaviest
  console.log(
    `  En ağır: HTML ${formatKb(html.bytes)}/${formatKb(BUDGET.html)} (${html.file}) · ` +
      `CSS ${formatKb(css.bytes)}/${formatKb(BUDGET.css)} · JS ${formatKb(js.bytes)}/${formatKb(BUDGET.js)} (${js.file})`,
  )
  if (result.issues.length === 0) {
    console.log('  ✓ Sorun yok.')
    return 0
  }
  const byFile = Map.groupBy(result.issues, (issue) => issue.file)
  console.log(`  ✗ ${result.issues.length} sorun:`)
  for (const [file, issues] of byFile) {
    console.log(`    ${target.outDir}/${file}`)
    for (const issue of issues) console.log(`      [${issue.rule}] ${issue.message}`)
  }
  return result.issues.length
}

let problems = 0
for (const target of targets) {
  if (!args.has('--no-build')) build(target)
  if (!args.has('--build-only')) problems += await audit(target)
}
if (problems > 0) {
  console.error(`\n✗ Toplam ${problems} sorun. Düzeltip yeniden çalıştırın: npm run check`)
  process.exit(1)
}
console.log(args.has('--build-only') ? '\n✓ Derlemeler hazır.' : '\n✓ Site denetimi geçti.')
