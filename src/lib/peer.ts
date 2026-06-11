import Peer, { type DataConnection } from 'peerjs'
import { db, ensureContact, pendingOf, type Message } from './db'
import { PEER_PREFIX } from './id'
import { useChatStore } from '../store/chat'

type WireMessage =
  | { type: 'msg'; id: string; text: string; ts: number }
  | { type: 'ack'; id: string }
  | { type: 'profile'; name: string }

const RETRY_INTERVAL_MS = 10_000
const RECONNECT_DELAY_MS = 2_000

class PeerManager {
  private peer: Peer | null = null
  private conns = new Map<string, DataConnection>()
  private attempts = new Map<string, number>()
  /** Peer henüz açılmadan istenen bağlantılar — 'open' gelince kurulur. */
  private queued = new Set<string>()
  private retryTimer: number | undefined

  start(myId: string) {
    if (this.peer) return
    const store = useChatStore.getState()
    store.setStatus('connecting')

    const peer = new Peer(PEER_PREFIX + myId, { debug: 1 })
    this.peer = peer

    peer.on('open', () => {
      useChatStore.getState().setStatus('online')
      const queued = [...this.queued]
      this.queued.clear()
      for (const id of queued) this.connectTo(id)
      void this.connectToContacts()
    })

    peer.on('connection', (conn) => this.setupConnection(conn))

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
        useChatStore.getState().setStatus('error')
        return
      }
      // Ağ kopması vb. ölümcül hatalarda Peer yok edilir; baştan başlat.
      if (peer.destroyed) {
        this.peer = null
        this.conns.clear()
        useChatStore.getState().setStatus('connecting')
        window.setTimeout(() => this.start(myId), RECONNECT_DELAY_MS)
      }
    })

    this.retryTimer ??= window.setInterval(
      () => void this.connectToContacts(),
      RETRY_INTERVAL_MS,
    )
  }

  /** Açık bağlantısı olmayan tüm kişilere bağlanmayı dener. */
  private async connectToContacts() {
    const contacts = await db.contacts.toArray()
    for (const c of contacts) this.connectTo(c.id)
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
    // Henüz açılmamış taze bir deneme varsa el sıkışmayı bölme; bayatsa temizle.
    if (existing && Date.now() - (this.attempts.get(friendId) ?? 0) < RETRY_INTERVAL_MS - 2_000) return
    existing?.close()
    this.conns.delete(friendId)
    this.attempts.set(friendId, Date.now())
    const conn = this.peer.connect(PEER_PREFIX + friendId, { reliable: true })
    this.setupConnection(conn)
  }

  private setupConnection(conn: DataConnection) {
    const friendId = conn.peer.startsWith(PEER_PREFIX)
      ? conn.peer.slice(PEER_PREFIX.length)
      : conn.peer
    this.conns.get(friendId)?.close()
    this.conns.set(friendId, conn)

    conn.on('open', () => {
      void (async () => {
        await ensureContact(friendId)
        await db.contacts.update(friendId, { lastSeen: Date.now() })
        useChatStore.getState().setOnline(friendId, true)
        const name = useChatStore.getState().myName
        if (name) conn.send({ type: 'profile', name } satisfies WireMessage)
        await this.flushPending(friendId, conn)
      })()
    })

    conn.on('data', (data) => {
      void this.handleData(friendId, conn, data as WireMessage)
    })

    const drop = () => {
      if (this.conns.get(friendId) === conn) {
        this.conns.delete(friendId)
        useChatStore.getState().setOnline(friendId, false)
      }
    }
    conn.on('close', drop)
    conn.on('error', drop)
  }

  private async handleData(friendId: string, conn: DataConnection, data: WireMessage) {
    switch (data?.type) {
      case 'msg': {
        await ensureContact(friendId)
        await db.messages.put({
          id: data.id,
          convId: friendId,
          direction: 'in',
          text: data.text,
          ts: data.ts,
          status: 'delivered',
        })
        await db.contacts.update(friendId, { lastSeen: Date.now() })
        conn.send({ type: 'ack', id: data.id } satisfies WireMessage)
        break
      }
      case 'ack':
        await db.messages.update(data.id, { status: 'delivered' })
        break
      case 'profile':
        await ensureContact(friendId)
        await db.contacts.update(friendId, { name: data.name })
        break
    }
  }

  /** Bağlantı yokken kuyruklanmış mesajları gönderir. */
  private async flushPending(friendId: string, conn: DataConnection) {
    const pending = await pendingOf(friendId)
    for (const m of pending) {
      if (!conn.open) return
      conn.send({ type: 'msg', id: m.id, text: m.text, ts: m.ts } satisfies WireMessage)
      await db.messages.update(m.id, { status: 'sent' })
    }
  }

  async sendMessage(friendId: string, text: string) {
    const msg: Message = {
      id: crypto.randomUUID(),
      convId: friendId,
      direction: 'out',
      text,
      ts: Date.now(),
      status: 'pending',
    }
    await db.messages.add(msg)
    const conn = this.conns.get(friendId)
    if (conn?.open) {
      conn.send({ type: 'msg', id: msg.id, text: msg.text, ts: msg.ts } satisfies WireMessage)
      await db.messages.update(msg.id, { status: 'sent' })
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
