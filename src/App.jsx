import { HashRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { CloudOff } from 'lucide-react'
import BottomNav, { AiChatLink } from './components/BottomNav.jsx'
import { InstallBanner, Toast } from './components/Banners.jsx'
import { useApp } from './context/AppContext.jsx'
import WalkPage from './pages/WalkPage.jsx'
import PhotosPage from './pages/PhotosPage.jsx'
import PassportPage from './pages/PassportPage.jsx'
import BadgesPage from './pages/BadgesPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import AiBarkPage from './pages/AiBarkPage.jsx'
import SniffPage from './pages/SniffPage.jsx'
import Splash from './components/Splash.jsx'
import './App.css'

function Shell() {
  const { ready, online, config } = useApp()

  useEffect(() => {
    document.title = config?.app?.name || 'woof.LY'
  }, [config])

  if (!ready) return <Splash />

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md bg-woof-cream dark:bg-woof-ink">
      <main className="px-4 pt-5 pb-28">
        {!online && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl bg-amber-100 dark:bg-amber-950/40 px-3 py-2 text-xs font-extrabold text-amber-700 dark:text-amber-300">
            <CloudOff size={14} /> Offline mode — everything still works.
          </div>
        )}
        <Routes>
          <Route path="/" element={<WalkPage />} />
          <Route path="/walk" element={<WalkPage />} />
          <Route path="/photos" element={<PhotosPage />} />
          <Route path="/passport" element={<PassportPage />} />
          <Route path="/badges" element={<BadgesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/ai" element={<AiBarkPage />} />
          <Route path="/sniff" element={<SniffPage />} />
          <Route path="*" element={<WalkPage />} />
        </Routes>
      </main>
      <BottomNav />
      <AiChatLink />
      <InstallBanner />
      <Toast />
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}