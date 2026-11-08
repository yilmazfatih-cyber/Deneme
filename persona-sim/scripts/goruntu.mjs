// Her sekmenin ekran görüntüsü: `npm run build && node scripts/goruntu.mjs` (önce vite preview'ı kendisi başlatır).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
let pw;
try { pw = req('playwright'); } catch { pw = req('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;

const port = 4173;
const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const hatalar = [];
page.on('pageerror', (e) => hatalar.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') hatalar.push(m.text()); });
const kok = `http://localhost:${port}/persona-sim/`;
await page.goto(`${kok}?seed=7&n=400&sure=1800&hiz=240`, { waitUntil: 'networkidle' });

async function sekme(ad) { await page.getByRole('button', { name: ad }).click(); await page.waitForTimeout(300); }
async function calistir(sure) { await page.getByRole('button', { name: /Simülasyonu başlat|Yeniden başlat/ }).click(); await page.waitForTimeout(sure); }

async function bitmesiniBekle() { await page.getByText(/· bitti ·/).waitFor({ timeout: 60000 }); await page.waitForTimeout(300); }
await sekme('Mağaza (2D)');
await calistir(4000);
await page.screenshot({ path: 'docs/shots/01-magaza.png' });
await sekme('E-ticaret hunisi');
await calistir(3000);
await page.screenshot({ path: 'docs/shots/02-eticaret.png' });
await page.goto(`${kok}?seed=7&n=600&sure=1800&hiz=600&sekme=reklam&kampanya=1`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'E-ticarette koş' }).click();
await bitmesiniBekle();
await page.screenshot({ path: 'docs/shots/03-hedefleme.png' });
await page.goto(`${kok}?sekme=kalibrasyon&seed=7&n=800&sure=1800&hiz=600`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Örnek fiş verisi üret' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'docs/shots/04-kaynak-b.png' });
// Küme hedefli kampanya (ADR-006)
await sekme('Reklam ve hedefleme');
await page.getByText('Kampanyayı koşudan önce uygula').click();
await page.getByLabel('Hedef birimi').selectOption('kume');
await page.getByRole('button', { name: 'E-ticarette koş' }).click();
await bitmesiniBekle();
await page.screenshot({ path: 'docs/shots/05-kume-hedefleme.png' });
console.log(hatalar.length ? `HATALAR:\n${hatalar.join('\n')}` : 'konsol hatası yok');
await browser.close();
preview.kill();
process.exit(hatalar.length ? 1 : 0);
