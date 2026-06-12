import Peer, { type DataConnection } from 'peerjs'
import { db, ensureContact, lastMessageOf, markSent, undeliveredOf, type Message } from './db'
import { PEER_PREFIX } from './id'
import { useChatStore } from '../store/chat'

type WireMessage =
  | { type: 'msg'; id: string; text: string; ts: number }
  | { type: 'ack'; id: string }
  | { type: 'profile'; name: string }
  | { type: 'ping' }
  | { type: 'pong' }

const RETRY_INTERVAL_MS = 10_000
const RECONNECT_DELAY_MS = 2_000
/** Bu süreden taze, henüz açılmamış bir el sıkışma varsa yeni deneme onu bölmesin. */
const HANDSHAKE_GRACE_MS = RETRY_INTERVAL_MS - 2_000
const ID_RETRY_DELAY_MS = 3_000
const MAX_ID_RETRIES = 3
/**
 * Karşıdan bu süre boyunca hiç veri/pong gelmediyse kanal yarı açık (zombi)
 * sayılır: telefon kilitlendiğinde/sekme donduğunda 'close' hiç gelmeyebilir.
 */
const STALE_MS = 30_000

class PeerManager {
  private peer: Peer | null = null
  private myId = ''
  private conns = new Map<string, DataConnection>()
  /** friendId → benim son arama (outgoing connect) zamanım. */
  private attempts = new Map<string, number>()
  /** friendId → mevcut bağlantının (yön fark etmez) benimsendiği an. */
  private connAt = new Map<string, number>()
  /** friendId → karşıdan en son veri (mesaj/ack/pong…) alınan an. */
  private lastHeard = new Map<string, number>()
  /** Peer henüz açılmadan istenen bağlantılar — 'open' gelince kurulur. */
  private queued = new Set<string>()
  private retryTimer: number | undefined
  private idRetries = 0
  private listenersBound = false

  start(myId: string) {
    if (this.peer) return
    this.myId = myId
    const store = useChatStore.getState()
    store.setStatus('connecting')

    // Katı NAT/CGNAT (örn. mobil operatörler) arkasında doğrudan bağlantı kurulamaz;
    // STUN'a ek olarak ücretsiz TURN relay'i (Open Relay) yedek yol sağlar.
    const peer = new Peer(PEER_PREFIX + myId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: [
              'turn:openrelay.metered.ca:80',
              'turn:openrelay.metered.ca:443',
              'turn:openrelay.metered.ca:443?transport=tcp',
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
        ],
      },
    })
    this.peer = peer

    peer.on('open', () => {
      this.idRetries = 0
      useChatStore.getState().setStatus('online')
      const queued = [...this.queued]
      this.queued.clear()
      for (const id of queued) this.connectTo(id)
      void this.connectToContacts()
    })

    peer.on('connection', (conn) => this.setupConnection(conn, true))

    peer.on('disconnected', () => {
      useChatStore.getState().setStatus('connecting')
      window.setTimeout(() => {
        if (this.peer === peer && !peer.destroyed) peer.reconnect()
      }, RECONNECT_DELAY_MS)
    })

    peer.on('error', (err) => {
      const type = (err as { type?: string }).type
      // Karşı taraf çevrimdışı — bağlantı denemesi başarısız, retry döngüsü tekrar dener.
      if (type === 'peer-unavailable') return
      if (type === 'unavailable-id') {
        // Hızlı yenileme/uyanma sonrası PeerJS Cloud eski oturumu birkaç saniye
        // daha tutabilir — hemen pes etme, kimliği birkaç kez yeniden dene.
        if (this.idRetries < MAX_ID_RETRIES) {
          this.idRetries++
          peer.destroy()
          this.peer = null
          this.conns.clear()
          this.connAt.clear()
          useChatStore.getState().setStatus('connecting')
          window.setTimeout(() => this.start(myId), ID_RETRY_DELAY_MS)
        } else {
          useChatStore.getState().setStatus('error')
        }
        return
      }
      // Ağ kopması vb. ölümcül hatalarda Peer yok edilir; baştan başlat.
      if (peer.destroyed) {
        this.peer = null
        this.conns.clear()
        this.connAt.clear()
        useChatStore.getState().setStatus('connecting')
        window.setTimeout(() => this.start(myId), RECONNECT_DELAY_MS)
      }
    })

    this.retryTimer ??= window.setInterval(
      () => void this.connectToContacts(),
      RETRY_INTERVAL_MS,
    )

    // Mobil uyku / ağ kopması dönüşünde retry'ı beklemeden toparlan.
    if (!this.listenersBound) {
      this.listenersBound = true
      const resume = () => {
        const p = this.peer
        if (!p || p.destroyed) return
        if (p.disconnected) p.reconnect()
        void this.connectToContacts()
      }
      window.addEventListener('online', resume)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resume()
      })
    }
  }

  /**
   * Periyodik süpürme: açık bağlantısı olmayan kişilere bağlanmayı dener;
   * açık bağlantılarda kalp atışı gönderir, zombi kanalı kapatıp yeniden arar
   * ve ack'siz mesajları yeniden gönderir. Böylece "açık görünen ama ölü"
   * bir kanala gönderilip kaybolan mesajlar en geç birkaç döngüde teslim olur.
   */
  private async connectToContacts() {
    const contacts = await db.contacts.toArray()
    for (const c of contacts) {
      try {
        const conn = this.conns.get(c.id)
        if (!conn?.open) {
          this.connectTo(c.id)
          continue
        }
        if (Date.now() - (this.lastHeard.get(c.id) ?? 0) > STALE_MS) {
          conn.close() // drop tetiklenir; hemen taze bir arama başlat
          this.connectTo(c.id)
          continue
        }
        conn.send({ type: 'ping' } satisfies WireMessage)
        await this.resendUndelivered(c.id, conn)
      } catch {
        // Tek kişideki gönderim hatası süpürmenin kalanını durdurmasın.
      }
    }
  }

  connectTo(friendId: string) {
    if (!this.peer || this.peer.destroyed) return
    // Sinyal sunucusu bağlantısı hazır değilken peer.connect sessizce kaybolur — kuyrukla.
    if (!this.peer.open || this.peer.disconnected) {
      this.queued.add(friendId)
      return
    }
    const existing = this.conns.get(friendId)
    if (existing?.open) return
    // Yön fark etmeksizin taze bir el sıkışma sürüyorsa bölme; bayatsa temizle.
    if (existing && Date.now() - (this.connAt.get(friendId) ?? 0) < HANDSHAKE_GRACE_MS) return
    existing?.close()
    this.conns.delete(friendId)
    this.connAt.delete(friendId)
    this.attempts.set(friendId, Date.now())
    const conn = this.peer.connect(PEER_PREFIX + friendId, { reliable: true })
    this.setupConnection(conn, false)
  }

  private setupConnection(conn: DataConnection, incoming: boolean) {
    const friendId = conn.peer.startsWith(PEER_PREFIX)
      ? conn.peer.slice(PEER_PREFIX.length)
      : conn.peer

    const existing = this.conns.get(friendId)
    if (existing && existing !== conn) {
      // Glare: iki taraf aynı anda birbirini ararsa deterministik çözüm —
      // küçük ID'li taraf başlatıcı olarak kazanır, geleni reddeder.
      // Ama bu kural yalnızca ben *yakın zamanda kendim aradıysam* geçerli:
      // karşı taraf sayfayı yenileyip yeniden aradığında elimdeki eski "zombi"
      // bağlantıyı koruyup geleni reddetmek karşıyı kalıcı olarak kilitler.
      const iRecentlyDialed =
        Date.now() - (this.attempts.get(friendId) ?? 0) < RETRY_INTERVAL_MS
      if (incoming && this.myId < friendId && iRecentlyDialed) {
        // Emniyet: el sıkışma ortasında close bazen tutmaz; yine de açılırsa
        // dinleyicisiz bir hayalet kanal kalmasın, açılır açılmaz kapat.
        conn.on('open', () => conn.close())
        conn.close()
        return
      }
      existing.close()
    }
    this.conns.set(friendId, conn)
    this.connAt.set(friendId, Date.now())

    conn.on('open', () => {
      this.lastHeard.set(friendId, Date.now())
      void (async () => {
        await ensureContact(friendId)
        await db.contacts.update(friendId, { lastSeen: Date.now() })
        useChatStore.getState().setOnline(friendId, true)
        const name = useChatStore.getState().myName
        if (name) conn.send({ type: 'profile', name } satisfies WireMessage)
        await this.resendUndelivered(friendId, conn)
      })()
    })

    conn.on('data', (data) => {
      void this.handleData(friendId, conn, data as WireMessage)
    })

    const drop = () => {
      if (this.conns.get(friendId) === conn) {
        this.conns.delete(friendId)
        this.connAt.delete(friendId)
        this.lastHeard.delete(friendId)
        useChatStore.getState().setOnline(friendId, false)
      }
    }
    conn.on('close', drop)
    conn.on('error', () => {
      conn.close()
      drop()
    })
    // Ağ tamamen koptuğunda 'close' gecikebilir; ICE çöküşünü zombi bırakma.
    conn.on('iceStateChanged', (state) => {
      if (state === 'failed' || state === 'closed') {
        conn.close()
        drop()
      }
    })
  }

  private async handleData(friendId: string, conn: DataConnection, data: WireMessage) {
    this.lastHeard.set(friendId, Date.now())
    switch (data?.type) {
      case 'msg': {
        await ensureContact(friendId)
        // Yeniden gönderim tekrarı: kayıt zaten varsa ts'i ezme, sadece ack'le.
        const exists = await db.messages.get(data.id)
        if (!exists) {
          // Gönderici saati ileride olabilir ya da kuyruktaki mesaj geç gelebilir;
          // sohbet sırası monoton kalsın: yerel saate kırp, son mesajın altına koy.
          const last = await lastMessageOf(friendId)
          const ts = Math.max(Math.min(data.ts, Date.now()), last ? last.ts + 1 : 0)
          await db.messages
            .add({
              id: data.id,
              convId: friendId,
              direction: 'in',
              text: data.text,
              ts,
              status: 'delivered',
            })
            .catch((e) => {
              if (e?.name !== 'ConstraintError') throw e
            })
        }
        await db.contacts.update(friendId, { lastSeen: Date.now() })
        if (conn.open) conn.send({ type: 'ack', id: data.id } satisfies WireMessage)
        break
      }
      case 'ack':
        await db.messages.update(data.id, { status: 'delivered' })
        break
      case 'profile':
        await ensureContact(friendId)
        await db.contacts.update(friendId, { name: data.name })
        break
      case 'ping':
        if (conn.open) conn.send({ type: 'pong' } satisfies WireMessage)
        break
      case 'pong':
        break
    }
  }

  /**
   * Teslim onayı (ack) almamış tüm mesajları yeniden gönderir: hem bağlantı
   * yokken kuyruklananlar hem de gönderilip karşıya ulaşmamış olabilenler.
   * Alıcı aynı id'li mesajı put ile üzerine yazdığından tekrar zararsızdır.
   */
  private async resendUndelivered(friendId: string, conn: DataConnection) {
    const undelivered = await undeliveredOf(friendId)
    for (const m of undelivered) {
      if (!conn.open) return
      conn.send({ type: 'msg', id: m.id, text: m.text, ts: m.ts } satisfies WireMessage)
      await markSent(m.id)
    }
  }

  async sendMessage(friendId: string, text: string) {
    const last = await lastMessageOf(friendId)
    const msg: Message = {
      id: crypto.randomUUID(),
      convId: friendId,
      direction: 'out',
      text,
      // Monoton ts: aynı milisaniyede üst üste gönderimde sıra bozulmasın.
      ts: Math.max(Date.now(), last ? last.ts + 1 : 0),
      status: 'pending',
    }
    await db.messages.add(msg)
    const conn = this.conns.get(friendId)
    if (conn?.open) {
      conn.send({ type: 'msg', id: msg.id, text: msg.text, ts: msg.ts } satisfies WireMessage)
      await markSent(msg.id)
    } else {
      this.connectTo(friendId)
    }
  }

  /** İsim değişince açık tüm bağlantılara yeni profili duyurur. */
  broadcastProfile(name: string) {
    for (const conn of this.conns.values()) {
      if (conn.open) conn.send({ type: 'profile', name } satisfies WireMessage)
    }
  }
}

export const peerManager = new PeerManager()
