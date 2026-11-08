// Her sekmenin ekran görüntüsü: `npm run build && node scripts/goruntu.mjs` (önce vite preview'ı kendisi başlatır).
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 4173;
const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const hatalar = [];
page.on('pageerror', (e) => hatalar.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') hatalar.push(m.text()); });
await page.goto(`http://localhost:${port}/persona-sim/`, { waitUntil: 'networkidle' });

async function sekme(ad) { await page.getByRole('button', { name: ad }).click(); await page.waitForTimeout(300); }
async function calistir(sure) { await page.getByRole('button', { name: /Simülasyonu başlat|Yeniden başlat/ }).click(); await page.waitForTimeout(sure); }

await sekme('Mağaza (2D)');
await page.getByLabel('Hız (sim sn / gerçek sn)').fill('60').catch(() => {});
await calistir(6000);
await page.screenshot({ path: 'docs/shots/01-magaza.png' });
await sekme('E-ticaret hunisi');
await calistir(6000);
await page.screenshot({ path: 'docs/shots/02-eticaret.png' });
await sekme('Reklam ve hedefleme');
await page.getByText('Kampanyayı koşudan önce uygula').click();
await page.getByRole('button', { name: 'E-ticarette koş' }).click();
await page.waitForTimeout(9000);
await page.screenshot({ path: 'docs/shots/03-hedefleme.png' });
await sekme('Kaynak B (gerçek veri)');
await page.getByRole('button', { name: 'Örnek fiş verisi üret' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'docs/shots/04-kaynak-b.png' });
console.log(hatalar.length ? `HATALAR:\n${hatalar.join('\n')}` : 'konsol hatası yok');
await browser.close();
preview.kill();
process.exit(hatalar.length ? 1 : 0);
