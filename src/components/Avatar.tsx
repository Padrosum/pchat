import { hueFromId } from '../lib/id'

interface AvatarProps {
  id: string
  name?: string
  className?: string
}

export function Avatar({ id, name, className }: AvatarProps) {
  const h = hueFromId(id)
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none ${className ?? 'size-10 text-base'}`}
      style={{
        background: `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 60) % 360} 70% 40%))`,
      }}
    >
      {(name?.trim()[0] ?? id[0]).toUpperCase()}
    </div>
  )
}
