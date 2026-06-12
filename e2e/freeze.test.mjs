// Mobil senaryo: B'nin sekmesi donar (telefon kilidi / arka plan), A bu sırada
// mesaj atar. A'nın elindeki bağlantı "açık" görünür ama ölüdür (zombi).
// Kalp atışı zombiyi tespit edip kapatmalı; B uyanınca mesaj teslim edilmeli
// ve B'nin cevabı A'ya ulaşmalı.
import { chromium } from 'playwright'

const BASE = process.env.PCHAT_URL ?? 'http://localhost:5173/pchat/'
const ok = (msg) => console.log('✓', msg)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function createIdentity(page, name) {
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Yeni kimlik oluştur' }).click()
  await page.getByPlaceholder('Arkadaşlarına görünecek adın').fill(name)
  await page.getByRole('button', { name: 'Sohbete başla' }).click()
  await page.waitForSelector('text=Yeni sohbet')
  return page.evaluate(() => localStorage.getItem('pchat:id'))
}

async function send(page, text) {
  await page.getByPlaceholder('Mesaj yaz…').fill(text)
  await page.keyboard.press('Enter')
}

const browser = await chromium.launch()
const ctxA = await browser.newContext()
const ctxB = await browser.newContext()
const pageA = await ctxA.newPage()
const pageB = await ctxB.newPage()
pageA.on('pageerror', (e) => console.log('A pageerror:', e.message))
pageB.on('pageerror', (e) => console.log('B pageerror:', e.message))

try {
  const idA = await createIdentity(pageA, 'Ece')
  const idB = await createIdentity(pageB, 'Fatih')
  await pageA.waitForSelector('text="Çevrimiçi"', { timeout: 30000 })
  await pageB.waitForSelector('text="Çevrimiçi"', { timeout: 30000 })
  ok(`Kimlikler hazır: A=${idA} B=${idB}`)

  // Bağlantı kur, karşılıklı birer mesaj (taban durum)
  await pageB.goto(BASE + idA)
  await pageB.waitForSelector('text="çevrimiçi"', { timeout: 30000 })
  await send(pageB, 'B: buradayım')
  await pageA.waitForSelector('text=Fatih', { timeout: 15000 })
  await pageA.getByText('Fatih', { exact: true }).click()
  await pageA.waitForSelector('text=B: buradayım', { timeout: 15000 })
  await send(pageA, 'A: ben de')
  await pageB.waitForSelector('text=A: ben de', { timeout: 15000 })
  ok('Taban durum: karşılıklı mesajlaşma çalışıyor')

  // B'nin sekmesini dondur (telefon kilidi taklidi)
  const cdp = await pageB.context().newCDPSession(pageB)
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
  ok('B donduruldu')

  // A donmuş B'ye mesaj atar — bağlantı A tarafında hâlâ açık görünür
  await sleep(2000)
  await send(pageA, 'A: kilitliyken yazdım')
  ok('A, B donmuşken mesaj gönderdi')

  // Kalp atışının zombi kanalı tespit etmesi için bekle (STALE_MS=30s + döngü)
  await sleep(45000)

  // B uyanır
  await cdp.send('Page.setWebLifecycleState', { state: 'active' })
  ok('B uyandırıldı')

  // Mesaj B'ye teslim edilmeli (yeniden bağlanma + resend)
  await pageB.waitForSelector('text=A: kilitliyken yazdım', { timeout: 60000 })
  ok('Donma sırasındaki mesaj B uyanınca teslim edildi')

  // Asıl şikâyet: karşı taraf cevap yazabilmeli ve cevap ulaşmalı
  await send(pageB, 'B: uyandım, cevap veriyorum')
  await pageA.waitForSelector('text=B: uyandım, cevap veriyorum', { timeout: 60000 })
  ok('B uyandıktan sonra cevabı A tarafına ulaştı')

  // A'daki mesaj durumu "iletildi"ye dönmeli, tekrar oluşmamalı
  const count = await pageB.locator('.whitespace-pre-wrap', { hasText: 'A: kilitliyken yazdım' }).count()
  if (count !== 1) throw new Error(`B tarafında mesaj ${count} kez görünüyor`)
  ok('Mesaj tekrarı yok')

  console.log('\nFREEZE TESTİ GEÇTİ')
} finally {
  await browser.close()
}
