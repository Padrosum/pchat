import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { peerManager } from './lib/peer'
import { useChatStore } from './store/chat'
import { Onboarding } from './components/Onboarding'
import { Shell } from './components/Shell'

export default function App() {
  const myId = useChatStore((s) => s.myId)

  useEffect(() => {
    if (myId) peerManager.start(myId)
  }, [myId])

  return (
    <Routes>
      <Route path="/:peerId?" element={myId ? <Shell /> : <Onboarding />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
