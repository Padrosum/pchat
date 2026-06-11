import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, messagesOf } from '../lib/db'
import { peerManager } from '../lib/peer'
import { useChatStore } from '../store/chat'
import { Avatar } from './Avatar'
import { MessageBubble } from './MessageBubble'
import { ArrowLeftIcon, SendIcon } from './icons'

export function ChatView({ friendId }: { friendId: string }) {
  const navigate = useNavigate()
  const online = useChatStore((s) => s.online[friendId] ?? false)
  const contact = useLiveQuery(() => db.contacts.get(friendId), [friendId])
  const messages = useLiveQuery(() => messagesOf(friendId), [friendId]) ?? []

  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Yeni mesajda en alta kaydır
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length, friendId])

  const send = () => {
    const t = text.trim()
    if (!t) return
    setText('')
    void peerManager.sendMessage(friendId, t)
  }

  const displayName = contact?.name || `${friendId.slice(0, 8)}…`

  return (
    <div className="flex h-full flex-col">
      {/* Başlık */}
      <div className="flex items-center gap-3 border-b border-white/8 bg-ink-900/60 px-4 py-3">
        <button
          onClick={() => navigate('/')}
          className="-ml-1 rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white md:hidden"
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <Avatar id={friendId} name={contact?.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{displayName}</div>
          <div className={`text-xs ${online ? 'text-emerald-400' : 'text-white/40'}`}>
            {online ? 'çevrimiçi' : 'çevrimdışı — mesajlar bağlanınca iletilir'}
          </div>
        </div>
        <code className="hidden shrink-0 rounded-lg bg-white/5 px-2.5 py-1 font-mono text-[11px] text-white/40 sm:block">
          {friendId}
        </code>
      </div>

      {/* Mesajlar */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-xs text-center text-sm text-white/30">
              Henüz mesaj yok — ilk mesajı göndererek sohbeti başlat. 👋
            </p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      {/* Giriş */}
      <div className="border-t border-white/8 bg-ink-900/60 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Mesaj yaz…"
            rows={1}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-violet-400/60"
          />
          <button
            onClick={send}
            disabled={!text.trim()}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:hover:brightness-100"
          >
            <SendIcon className="size-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
