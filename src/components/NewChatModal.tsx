import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ensureContact } from '../lib/db'
import { isValidId } from '../lib/id'
import { peerManager } from '../lib/peer'
import { useChatStore } from '../store/chat'
import { XIcon } from './icons'

export function NewChatModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const myId = useChatStore((s) => s.myId)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    // Davet linki yapıştırılmışsa son parçayı al
    const raw = value.trim().toLowerCase().replaceAll(' ', '')
    const id = raw.includes('/') ? (raw.split('/').filter(Boolean).pop() ?? '') : raw
    if (!isValidId(id)) {
      setError('Geçersiz kimlik — 16 haneli ID veya davet linki gir.')
      return
    }
    if (id === myId) {
      setError('Bu senin kendi kimliğin 🙂')
      return
    }
    await ensureContact(id)
    peerManager.connectTo(id)
    onClose()
    navigate(`/${id}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-white">Yeni sohbet</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <p className="mb-3 text-sm text-white/50">
          Arkadaşının 16 haneli kimliğini veya davet linkini gir.
        </p>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
          placeholder="ID veya davet linki"
          autoFocus
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-white placeholder-white/25 outline-none focus:border-violet-400/60"
        />
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
        <button
          onClick={() => void handleSubmit()}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
        >
          Sohbeti başlat
        </button>
      </motion.div>
    </motion.div>
  )
}
