import { create } from 'zustand'

export type PeerStatus = 'idle' | 'connecting' | 'online' | 'error'

const ID_KEY = 'pchat:id'
const NAME_KEY = 'pchat:name'

interface ChatState {
  myId: string | null
  myName: string
  status: PeerStatus
  /** friendId → açık bir DataConnection var mı */
  online: Record<string, boolean>
  setIdentity: (id: string) => void
  setMyName: (name: string) => void
  setStatus: (status: PeerStatus) => void
  setOnline: (friendId: string, online: boolean) => void
}

export const useChatStore = create<ChatState>((set) => ({
  myId: localStorage.getItem(ID_KEY),
  myName: localStorage.getItem(NAME_KEY) ?? '',
  status: 'idle',
  online: {},
  setIdentity: (id) => {
    localStorage.setItem(ID_KEY, id)
    set({ myId: id })
  },
  setMyName: (name) => {
    localStorage.setItem(NAME_KEY, name)
    set({ myName: name })
  },
  setStatus: (status) => set({ status }),
  setOnline: (friendId, online) =>
    set((s) => ({ online: { ...s.online, [friendId]: online } })),
}))
