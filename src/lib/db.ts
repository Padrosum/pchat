import Dexie, { type EntityTable } from 'dexie'

export interface Contact {
  id: string
  name?: string
  lastSeen?: number
  createdAt: number
}

export type MessageStatus = 'pending' | 'sent' | 'delivered'

export interface Message {
  id: string
  convId: string
  direction: 'in' | 'out'
  text: string
  ts: number
  status: MessageStatus
}

export const db = new Dexie('pchat') as Dexie & {
  contacts: EntityTable<Contact, 'id'>
  messages: EntityTable<Message, 'id'>
}

db.version(1).stores({
  contacts: 'id, createdAt',
  messages: 'id, convId, ts, [convId+ts]',
})

export async function ensureContact(id: string): Promise<void> {
  // Eşzamanlı çağrılar yarışabilir (örn. StrictMode çift effect) — ConstraintError'ı yut.
  const existing = await db.contacts.get(id)
  if (!existing) {
    await db.contacts.add({ id, createdAt: Date.now() }).catch((e) => {
      if (e?.name !== 'ConstraintError') throw e
    })
  }
}

export function lastMessageOf(convId: string) {
  return db.messages.where('[convId+ts]').between([convId, Dexie.minKey], [convId, Dexie.maxKey]).last()
}

export function messagesOf(convId: string) {
  return db.messages
    .where('[convId+ts]')
    .between([convId, Dexie.minKey], [convId, Dexie.maxKey])
    .toArray()
}

export function undeliveredOf(convId: string) {
  return db.messages
    .where('convId')
    .equals(convId)
    .filter((m) => m.direction === 'out' && m.status !== 'delivered')
    .sortBy('ts')
}
