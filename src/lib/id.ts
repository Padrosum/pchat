// Karışıklığa açık karakterler (0/o, 1/l/i) hariç 31 karakterlik alfabe.
// 16 hane ≈ 79 bit entropi — çakışma pratikte imkânsız.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export const ID_LENGTH = 16

// PeerJS Cloud halka açık olduğundan peer ID'leri uygulamaya özel öneklenir.
export const PEER_PREFIX = 'pchat-'

export function generateId(): string {
  const bytes = new Uint8Array(ID_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export function isValidId(value: string): boolean {
  return value.length === ID_LENGTH && [...value].every((c) => ALPHABET.includes(c))
}

export function shareLink(id: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}${id}`
}

export function hueFromId(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}
