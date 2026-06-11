import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { generateId, isValidId, shareLink } from '../lib/id'
import { useChatStore } from '../store/chat'
import { ChatIcon, CopyIcon, CheckIcon } from './icons'

type Mode = 'choice' | 'create' | 'join'

function formatId(id: string) {
  return id.replace(/(.{4})(?=.)/g, '$1 ')
}

export function Onboarding() {
  const { peerId } = useParams()
  const invited = peerId !== undefined && isValidId(peerId)
  const setIdentity = useChatStore((s) => s.setIdentity)
  const setMyName = useChatStore((s) => s.setMyName)

  const [mode, setMode] = useState<Mode>('choice')
  const [newId] = useState(generateId)
  const [name, setName] = useState('')
  const [joinId, setJoinId] = useState('')
  const [joinError, setJoinError] = useState('')
  const [copied, setCopied] = useState(false)

  const finish = (id: string) => {
    if (name.trim()) setMyName(name.trim())
    setIdentity(id)
  }

  const handleJoin = () => {
    const id = joinId.trim().toLowerCase().replaceAll(' ', '')
    if (!isValidId(id)) {
      setJoinError('Geçersiz kimlik — 16 haneli olmalı (0, 1, i, l, o kullanılmaz).')
      return
    }
    finish(id)
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareLink(newId))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden p-4">
      {/* Arka plan ışıltıları */}
      <div className="pointer-events-none absolute -top-40 -left-40 size-150 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 -bottom-40 size-150 rounded-full bg-fuchsia-600/15 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-md rounded-3xl border border-white/10 bg-ink-900/80 p-8 shadow-2xl backdrop-blur"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600">
            <ChatIcon className="size-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">pchat</h1>
            <p className="text-sm text-white/50">Sunucusuz, uçtan uca P2P sohbet</p>
          </div>
        </div>

        {invited && (
          <div className="mb-5 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
            Biri seni sohbete davet etti. Başlamak için önce bir kimlik oluştur.
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {mode === 'choice' && (
            <motion.div
              key="choice"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <button
                onClick={() => setMode('create')}
                className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
              >
                Yeni kimlik oluştur
              </button>
              <button
                onClick={() => setMode('join')}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 font-medium text-white/80 transition hover:bg-white/10 active:scale-[0.98]"
              >
                Mevcut kimliğimle gir
              </button>
            </motion.div>
          )}

          {mode === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1.5 block text-xs font-medium tracking-wide text-white/50 uppercase">
                  Kimliğin
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                  <code className="flex-1 font-mono text-sm tracking-wider text-emerald-300">
                    {formatId(newId)}
                  </code>
                  <button
                    onClick={copyLink}
                    title="Davet linkini kopyala"
                    className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                  >
                    {copied ? <CheckIcon className="size-4 text-emerald-400" /> : <CopyIcon className="size-4" />}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-white/40">
                  Davet linkin: <span className="text-white/60">{shareLink(newId)}</span>
                </p>
              </div>
              <NameInput name={name} setName={setName} />
              <button
                onClick={() => finish(newId)}
                className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
              >
                Sohbete başla
              </button>
              <BackButton onClick={() => setMode('choice')} />
            </motion.div>
          )}

          {mode === 'join' && (
            <motion.div
              key="join"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1.5 block text-xs font-medium tracking-wide text-white/50 uppercase">
                  16 haneli kimliğin
                </label>
                <input
                  value={joinId}
                  onChange={(e) => {
                    setJoinId(e.target.value)
                    setJoinError('')
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="örn. k7mp 2xqe w9rt 5hzn"
                  autoFocus
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm tracking-wider text-white placeholder-white/25 outline-none focus:border-violet-400/60"
                />
                {joinError && <p className="mt-1.5 text-xs text-rose-400">{joinError}</p>}
              </div>
              <NameInput name={name} setName={setName} />
              <button
                onClick={handleJoin}
                className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
              >
                Devam et
              </button>
              <BackButton onClick={() => setMode('choice')} />
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-6 text-center text-xs leading-relaxed text-white/30">
          Mesajların hiçbir sunucuda saklanmaz; doğrudan tarayıcıdan tarayıcıya
          (WebRTC) iletilir ve geçmiş yalnızca bu cihazda tutulur.
        </p>
      </motion.div>
    </div>
  )
}

function NameInput({ name, setName }: { name: string; setName: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium tracking-wide text-white/50 uppercase">
        Görünen ad <span className="normal-case text-white/30">(isteğe bağlı)</span>
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Arkadaşlarına görünecek adın"
        maxLength={32}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-violet-400/60"
      />
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-1 text-center text-sm text-white/40 transition hover:text-white/70"
    >
      ← Geri
    </button>
  )
}
