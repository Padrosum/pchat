# pchat

Sunucusuz, uçtan uca **P2P sohbet sitesi**. Altyapı olarak yalnızca GitHub Pages (statik hosting) kullanır; mesajlar tarayıcıdan tarayıcıya doğrudan **WebRTC** ile akar, sohbet geçmişi yalnızca yerel tarayıcıda (IndexedDB) saklanır.

**Canlı:** https://padrosum.uk/pchat/

## Nasıl çalışır?

- İlk girişte 16 haneli rastgele bir kimlik üretilir (`crypto.getRandomValues`, ~79 bit entropi).
- `padrosum.uk/pchat/<kimlik>` linki senin adresindir — linki açan herkes seninle sohbet başlatabilir.
- Eşleşme (signaling) için ücretsiz [PeerJS Cloud](https://peerjs.com/) kullanılır; mesajlar bu sunucudan **geçmez**, yalnızca WebRTC el sıkışması yapılır. WebRTC kanalları varsayılan olarak DTLS ile şifrelidir.
- İki taraf da çevrimiçiyken mesajlar anında iletilir; karşı taraf kapalıyken yazılanlar yerelde kuyruklanır ve bağlantı kurulunca otomatik gönderilir.

## Geliştirme

```bash
npm install
npm run dev            # http://localhost:5173/pchat/
npm run build          # üretim derlemesi (dist/)
node e2e/p2p.test.mjs  # dev sunucusu açıkken uçtan uca P2P testi
```

## Yığın

Vite · React 19 · TypeScript · Tailwind CSS v4 · Motion · PeerJS · Dexie (IndexedDB) · Zustand

## Deploy

`main` dalına her push, GitHub Actions ile derlenip GitHub Pages'e yayınlanır (`.github/workflows/deploy.yml`). `/pchat/<id>` gibi derin linkler için `public/404.html` SPA yönlendirme tekniği kullanılır.

## Yol haritası

- [ ] Electron ile masaüstü paketi (kod tabanı tamamen tarayıcı API'leriyle sınırlı tutuldu; renderer'da olduğu gibi çalışır)
