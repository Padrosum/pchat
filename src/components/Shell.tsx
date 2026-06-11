import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { ensureContact } from '../lib/db'
import { isValidId, shareLink } from '../lib/id'
import { peerManager } from '../lib/peer'
import { useChatStore } from '../store/chat'
import { ChatView } from './ChatView'
import { Sidebar } from './Sidebar'
import { ChatIcon, CheckIcon, CopyIcon } from './icons'

export function Shell() {
  const { peerId } = useParams()
  const myId = useChatStore((s) => s.myId)!

  // Davet linkiyle gelinen kişiyi rehbere ekle ve bağlanmayı dene
  useEffect(() => {
    if (peerId && peerId !== myId && isValidId(peerId)) {
      void ensureContact(peerId).then(() => peerManager.connectTo(peerId))
    }
  }, [peerId, myId])

  if (peerId && (peerId === myId || !isValidId(peerId))) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex h-full">
      <div className={`${peerId ? 'hidden md:flex' : 'flex'} w-full shrink-0 md:w-80 lg:w-96`}>
        <Sidebar />
      </div>
      <div className={`${peerId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1`}>
        {peerId ? (
          <div className="h-full w-full">
            <ChatView friendId={peerId} />
          </div>
        ) : (
          <EmptyState myId={myId} />
        )}
      </div>
    </div>
  )
}

function EmptyState({ myId }: { myId: string }) {
  const [copied, setCopied] = useState(false)
  const link = shareLink(myId)

  const copy = async () => {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-5 overflow-hidden p-8">
      <div className="pointer-events-none absolute top-1/4 left-1/3 size-125 rounded-full bg-violet-600/10 blur-3xl" />
      <div className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-600">
        <ChatIcon className="size-8 text-white" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-white">Bir sohbet seç</h2>
        <p className="mt-1 max-w-sm text-sm text-white/40">
          Soldan bir sohbet aç ya da davet linkini paylaşarak arkadaşlarının sana
          ulaşmasını sağla.
        </p>
      </div>
      <button
        onClick={copy}
        className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        <span className="max-w-64 truncate sm:max-w-none">{link}</span>
        {copied ? <CheckIcon className="size-4 text-emerald-400" /> : <CopyIcon className="size-4" />}
      </button>
    </div>
  )
}
