import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, lastMessageOf, type Contact } from '../lib/db'
import { shareLink, ID_LENGTH } from '../lib/id'
import { peerManager } from '../lib/peer'
import { useChatStore } from '../store/chat'
import { Avatar } from './Avatar'
import { NewChatModal } from './NewChatModal'
import { CheckIcon, ChatIcon, CopyIcon, PencilIcon, PlusIcon } from './icons'

const STATUS_LABEL = {
  idle: 'Başlatılıyor…',
  connecting: 'Bağlanıyor…',
  online: 'Çevrimiçi',
  error: 'Kimlik başka bir oturumda açık',
} as const

export function Sidebar() {
  const myId = useChatStore((s) => s.myId)!
  const myName = useChatStore((s) => s.myName)
  const status = useChatStore((s) => s.status)
  const setMyName = useChatStore((s) => s.setMyName)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)

  const contacts =
    useLiveQuery(
      () => db.contacts.toArray().then((c) => c.sort((a, b) => (b.lastSeen ?? b.createdAt) - (a.lastSeen ?? a.createdAt))),
      [],
    ) ?? []

  const saveName = () => {
    const name = draft.trim()
    setEditing(false)
    if (name && name !== myName) {
      setMyName(name)
      peerManager.broadcastProfile(name)
    }
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareLink(myId))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full flex-col border-r border-white/8 bg-ink-900/60">
      {/* Kendi profil başlığı */}
      <div className="flex items-center gap-3 border-b border-white/8 p-4">
        <Avatar id={myId} name={myName} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              maxLength={32}
              autoFocus
              className="w-full rounded-md border border-violet-400/50 bg-black/30 px-1.5 py-0.5 text-sm font-semibold text-white outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setDraft(myName)
                setEditing(true)
              }}
              className="group flex max-w-full items-center gap-1.5 text-sm font-semibold text-white"
              title="Adını düzenle"
            >
              <span className="truncate">{myName || 'İsimsiz'}</span>
              <PencilIcon className="size-3 shrink-0 text-white/30 transition group-hover:text-white/70" />
            </button>
          )}
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <span
              className={`size-1.5 rounded-full ${
                status === 'online'
                  ? 'bg-emerald-400'
                  : status === 'error'
                    ? 'bg-rose-400'
                    : 'animate-pulse bg-amber-400'
              }`}
            />
            <span className="truncate">{STATUS_LABEL[status]}</span>
          </div>
        </div>
        <button
          onClick={copyLink}
          title="Davet linkini kopyala"
          className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          {copied ? <CheckIcon className="size-4.5 text-emerald-400" /> : <CopyIcon className="size-4.5" />}
        </button>
      </div>

      {/* Sohbet listesi */}
      <div className="flex-1 overflow-y-auto p-2">
        {contacts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <ChatIcon className="size-10 text-white/15" />
            <p className="text-sm text-white/40">
              Henüz sohbet yok. Davet linkini paylaş ya da arkadaşının kimliğiyle
              yeni bir sohbet başlat.
            </p>
          </div>
        ) : (
          contacts.map((c) => <ContactRow key={c.id} contact={c} />)
        )}
      </div>

      {/* Yeni sohbet */}
      <div className="border-t border-white/8 p-3">
        <button
          onClick={() => setShowModal(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
        >
          <PlusIcon className="size-5" />
          Yeni sohbet
        </button>
      </div>

      <AnimatePresence>
        {showModal && <NewChatModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </div>
  )
}

function ContactRow({ contact }: { contact: Contact }) {
  const navigate = useNavigate()
  const { peerId } = useParams()
  const online = useChatStore((s) => s.online[contact.id] ?? false)
  const last = useLiveQuery(() => lastMessageOf(contact.id), [contact.id])
  const active = peerId === contact.id

  return (
    <button
      onClick={() => navigate(`/${contact.id}`)}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
        active ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
    >
      <div className="relative">
        <Avatar id={contact.id} name={contact.name} />
        {online && (
          <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-ink-900 bg-emerald-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">
          {contact.name || `${contact.id.slice(0, ID_LENGTH / 2)}…`}
        </div>
        <div className="truncate text-xs text-white/40">
          {last ? (last.direction === 'out' ? `Sen: ${last.text}` : last.text) : 'Yeni sohbet'}
        </div>
      </div>
      {last && (
        <span className="shrink-0 text-[10px] text-white/30">
          {new Date(last.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </button>
  )
}
