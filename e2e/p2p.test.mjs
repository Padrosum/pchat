// pchat uçtan uca testi: iki ayrı tarayıcı bağlamı PeerJS Cloud üzerinden mesajlaşır.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173/pchat/'
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
pageA.on('pageerror', (e) => console.log('A pageerror:', e.message))
pageB.on('pageerror', (e) => console.log('B pageerror:', e.message))

try {
  const idA = await createIdentity(pageA, 'Ali')
  const idB = await createIdentity(pageB, 'Veli')
  if (!/^[a-z2-9]{16}$/.test(idA) || !/^[a-z2-9]{16}$/.test(idB)) {
    throw new Error(`ID formatı hatalı: ${idA} / ${idB}`)
  }
  ok(`Kimlikler oluştu: A=${idA} B=${idB}`)

  // A'nın PeerJS Cloud'a bağlanmasını bekle
  await pageA.waitForSelector('text="Çevrimiçi"', { timeout: 30000 })
  await pageB.waitForSelector('text="Çevrimiçi"', { timeout: 30000 })
  ok('İki taraf da PeerJS Cloud üzerinde çevrimiçi')

  // B, A'nın davet linkini açar
  await pageB.goto(BASE + idA)
  await pageB.waitForSelector('text="çevrimiçi"', { timeout: 30000 })
  ok('B → A WebRTC bağlantısı kuruldu (çevrimiçi görünüyor)')

  // B mesaj gönderir
  await pageB.getByPlaceholder('Mesaj yaz…').fill('Selam Ali! Bu bir P2P test mesajı.')
  await pageB.keyboard.press('Enter')
  await pageB.waitForSelector('text=Selam Ali! Bu bir P2P test mesajı.')

  // A tarafında kişi listesinde görünmeli ve mesaj ulaşmalı
  await pageA.waitForSelector('text=Veli', { timeout: 15000 })
  await pageA.getByText('Veli', { exact: true }).click()
  await pageA.waitForSelector('text=Selam Ali! Bu bir P2P test mesajı.', { timeout: 15000 })
  ok('Mesaj A tarafına ulaştı, profil adı (Veli) paylaşıldı')

  // A cevap verir
  await pageA.getByPlaceholder('Mesaj yaz…').fill('Merhaba Veli, mesajın geldi!')
  await pageA.keyboard.press('Enter')
  await pageB.waitForSelector('text=Merhaba Veli, mesajın geldi!', { timeout: 15000 })
  ok('Çift yönlü mesajlaşma çalışıyor')

  // Kalıcılık: B sayfayı yeniler, geçmiş IndexedDB'den gelmeli
  await pageB.reload()
  await pageB.waitForSelector('text=Selam Ali! Bu bir P2P test mesajı.', { timeout: 15000 })
  await pageB.waitForSelector('text=Merhaba Veli, mesajın geldi!', { timeout: 15000 })
  ok('Yenileme sonrası geçmiş IndexedDB üzerinden geri yüklendi')

  // Çevrimdışı kuyruk: A kapanır, B mesaj yazar → bekliyor; A açılınca teslim edilir
  await pageA.close()
  await pageB.waitForSelector('text=çevrimdışı', { timeout: 20000 })
  await pageB.getByPlaceholder('Mesaj yaz…').fill('Bu mesaj sen yokken yazıldı')
  await pageB.keyboard.press('Enter')
  await pageB.waitForSelector('text=Bu mesaj sen yokken yazıldı')
  ok('A çevrimdışıyken mesaj kuyruklandı')

  const pageA2 = await ctxA.newPage()
  await pageA2.goto(BASE)
  await pageA2.waitForSelector('text="Çevrimiçi"', { timeout: 30000 })
  await pageA2.getByText('Veli', { exact: true }).click()
  await pageA2.waitForSelector('text=Bu mesaj sen yokken yazıldı', { timeout: 30000 })
  ok('A tekrar açılınca kuyruktaki mesaj teslim edildi')

  console.log('\nTÜM TESTLER GEÇTİ')
} finally {
  await browser.close()
}
