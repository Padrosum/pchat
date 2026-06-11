import { motion } from 'motion/react'
import type { Message } from '../lib/db'
import { CheckCheckIcon, CheckIcon, ClockIcon } from './icons'

const time = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' })

function StatusTick({ status }: { status: Message['status'] }) {
  if (status === 'pending') return <ClockIcon className="size-3.5 text-white/50" />
  if (status === 'sent') return <CheckIcon className="size-3.5 text-white/60" />
  return <CheckCheckIcon className="size-3.5 text-sky-300" />
}

export function MessageBubble({ message }: { message: Message }) {
  const out = message.direction === 'out'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`flex ${out ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap ${
          out
            ? 'rounded-br-md bg-gradient-to-br from-violet-600 to-fuchsia-700 text-white'
            : 'rounded-bl-md border border-white/8 bg-ink-800 text-white/90'
        }`}
      >
        {message.text}
        <span
          className={`mt-0.5 ml-2 inline-flex translate-y-0.5 items-center gap-1 text-[10px] ${
            out ? 'text-white/60' : 'text-white/35'
          }`}
        >
          {time.format(message.ts)}
          {out && <StatusTick status={message.status} />}
        </span>
      </div>
    </motion.div>
  )
}
