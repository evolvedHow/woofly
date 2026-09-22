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
import WoofCirclePage from './pages/WoofCirclePage.jsx'
import Splash from './components/Splash.jsx'
import './App.css'

function Pages() {
  const { online } = useApp()
  return (
    <>
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
        <Route path="/woof" element={<WoofCirclePage />} />
        <Route path="*" element={<WalkPage />} />
      </Routes>
    </>
  )
}

function PhoneBezel({ children }) {
  return (
    <div className="relative" style={{ width: 'min(94vw, 26rem)', height: 'min(94vh, 54rem)' }}>
      <div className="absolute -left-[13px] top-24 h-14 w-[4px] rounded-full bg-slate-600 dark:bg-slate-500" />
      <div className="absolute -left-[13px] top-40 h-20 w-[4px] rounded-full bg-slate-600 dark:bg-slate-500" />
      <div className="absolute -left-[13px] top-72 h-14 w-[4px] rounded-full bg-slate-600 dark:bg-slate-500" />
      <div className="absolute -right-[13px] top-28 h-16 w-[4px] rounded-full bg-slate-600 dark:bg-slate-500" />
      <div className="relative h-full w-full rounded-[3rem] bg-slate-800 p-[10px] shadow-[0_40px_90px_-25px_rgba(15,23,42,0.6)] dark:bg-slate-700">
        <div className="relative h-full w-full overflow-hidden rounded-[2.4rem] bg-woof-cream dark:bg-woof-ink">
          <div className="absolute left-1/2 top-0 z-30 flex h-6 w-28 -translate-x-1/2 items-center justify-center gap-2 rounded-b-[1.1rem] bg-black">
            <span className="h-2.5 w-10 rounded-full bg-black/60" />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

function Framed() {
  return (
    <div className="desktop-bg grid min-h-dvh place-items-center p-4">
      <div className="flex flex-col items-center gap-3">
        <PhoneBezel>
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-6">
              <Pages />
            </div>
            <BottomNav />
          </div>
          <AiChatLink />
          <InstallBanner />
          <Toast />
        </PhoneBezel>
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500/80">
          woof.LY · phone viewport preview
        </p>
      </div>
    </div>
  )
}

function Mobile() {
  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md bg-woof-cream dark:bg-woof-ink">
      <main className="px-4 pt-5 pb-28">
        <Pages />
      </main>
      <BottomNav />
      <AiChatLink />
      <InstallBanner />
      <Toast />
    </div>
  )
}

function Shell() {
  const { ready, framed, config } = useApp()

  useEffect(() => {
    document.title = config?.app?.name || 'woof.LY'
  }, [config])

  if (!ready) return <Splash />

  return framed ? <Framed /> : <Mobile />
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}