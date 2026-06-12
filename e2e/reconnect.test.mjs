// Yenileme senaryosu: taraflardan biri sayfayı yeniler; karşı tarafta kalan
// eski "zombi" bağlantıya rağmen yeniden bağlanma ve karşılıklı mesajlaşma
// çalışmalı. Küçük/büyük ID dallarını örtmek için iki taraf da sırayla yenilenir.
import { chromium } from 'playwright'

const BASE = process.env.PCHAT_URL ?? 'http://localhost:5173/pchat/'
const ok = (msg) => console.log('✓', msg)

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
  const idA = await createIdentity(pageA, 'Cem')
  const idB = await createIdentity(pageB, 'Derya')
  await pageA.waitForSelector('text="Çevrimiçi"', { timeout: 30000 })
  await pageB.waitForSelector('text="Çevrimiçi"', { timeout: 30000 })
  ok(`Kimlikler hazır: A=${idA} B=${idB}`)

  // İlk bağlantı ve karşılıklı birer mesaj
  await pageB.goto(BASE + idA)
  await pageB.waitForSelector('text="çevrimiçi"', { timeout: 30000 })
  await send(pageB, 'B: ilk mesaj')
  await pageA.waitForSelector('text=Derya', { timeout: 15000 })
  await pageA.getByText('Derya', { exact: true }).click()
  await pageA.waitForSelector('text=B: ilk mesaj', { timeout: 15000 })
  await send(pageA, 'A: ilk cevap')
  await pageB.waitForSelector('text=A: ilk cevap', { timeout: 15000 })
  ok('İlk bağlantı ve karşılıklı mesajlaşma tamam')

  // Tur 1: B yenilenir, tur 2: A yenilenir — iki glare dalı da test edilir.
  const rounds = [
    { who: 'B', page: pageB, other: pageA },
    { who: 'A', page: pageA, other: pageB },
  ]
  for (const [i, { who, page, other }] of rounds.entries()) {
    await page.reload()
    await Promise.all([
      page.waitForSelector('text="çevrimiçi"', { timeout: 30000 }),
      other.waitForSelector('text="çevrimiçi"', { timeout: 30000 }),
    ])
    ok(`${who} yenilendi, iki taraf da tekrar çevrimiçi görüyor`)

    await send(page, `${who}: yenileme ${i + 1} sonrası mesaj`)
    await other.waitForSelector(`text=${who}: yenileme ${i + 1} sonrası mesaj`, { timeout: 20000 })
    await send(other, `cevap ${i + 1}`)
    await page.waitForSelector(`text=cevap ${i + 1}`, { timeout: 20000 })
    ok(`${who} yenilemesi sonrası karşılıklı mesajlaşma çalışıyor`)
  }

  // Yeniden gönderim tekrar yaratmamalı: ilk mesajın baloncuğu iki tarafta da tek olmalı
  for (const [label, page] of [['A', pageA], ['B', pageB]]) {
    const count = await page
      .locator('.whitespace-pre-wrap', { hasText: 'B: ilk mesaj' })
      .count()
    if (count !== 1) throw new Error(`${label} tarafında 'B: ilk mesaj' ${count} kez görünüyor`)
  }
  ok('Yenilemeler sonrası mesaj tekrarı yok')

  console.log('\nRECONNECT TESTİ GEÇTİ')
} finally {
  await browser.close()
}
