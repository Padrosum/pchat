// Glare senaryosu: iki taraf AYNI ANDA birbirinin davet linkini açar ve
// ikisi de mesaj gönderir. Çift bağlantı çakışmasının çözüldüğünü doğrular.
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

const browser = await chromium.launch()
const ctxA = await browser.newContext()
const ctxB = await browser.newContext()
const pageA = await ctxA.newPage()
const pageB = await ctxB.newPage()

try {
  const idA = await createIdentity(pageA, 'Ayşe')
  const idB = await createIdentity(pageB, 'Burak')
  await pageA.waitForSelector('text="Çevrimiçi"', { timeout: 30000 })
  await pageB.waitForSelector('text="Çevrimiçi"', { timeout: 30000 })
  ok(`Kimlikler hazır: A=${idA} B=${idB}`)

  // İki taraf aynı anda birbirinin linkini açar (glare)
  await Promise.all([pageA.goto(BASE + idB), pageB.goto(BASE + idA)])
  await Promise.all([
    pageA.waitForSelector('text="çevrimiçi"', { timeout: 30000 }),
    pageB.waitForSelector('text="çevrimiçi"', { timeout: 30000 }),
  ])
  ok('Eşzamanlı bağlantı çakışması çözüldü, iki taraf da çevrimiçi görüyor')

  // İkisi de aynı anda mesaj atar
  await Promise.all([
    (async () => {
      await pageA.getByPlaceholder('Mesaj yaz…').fill('A: merhaba!')
      await pageA.keyboard.press('Enter')
    })(),
    (async () => {
      await pageB.getByPlaceholder('Mesaj yaz…').fill('B: selam!')
      await pageB.keyboard.press('Enter')
    })(),
  ])
  await pageA.waitForSelector('text=B: selam!', { timeout: 20000 })
  await pageB.waitForSelector('text=A: merhaba!', { timeout: 20000 })
  ok('Eşzamanlı gönderilen mesajlar iki yönde de ulaştı')

  // Kullanıcının senaryosu: alan taraf cevap verir, cevap karşıya ulaşmalı
  await pageB.getByPlaceholder('Mesaj yaz…').fill('B: cevabım geldi mi?')
  await pageB.keyboard.press('Enter')
  await pageA.waitForSelector('text=B: cevabım geldi mi?', { timeout: 20000 })
  await pageA.getByPlaceholder('Mesaj yaz…').fill('A: geldi, ben de cevapladım')
  await pageA.keyboard.press('Enter')
  await pageB.waitForSelector('text=A: geldi, ben de cevapladım', { timeout: 20000 })
  ok('Karşılıklı cevaplaşma sorunsuz')

  console.log('\nGLARE TESTİ GEÇTİ')
} finally {
  await browser.close()
}
