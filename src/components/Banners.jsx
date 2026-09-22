import { useApp } from '../context/AppContext.jsx'
import { Download, X } from 'lucide-react'

export function InstallBanner() {
  const { installPrompt, setInstallPrompt, framed } = useApp()
  if (!installPrompt) return null
  return (
    <div
      className={`bottom-20 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 animate-fadeIn ${
        framed ? 'absolute' : 'fixed'
      }`}
    >
      <div className="card flex items-center gap-3 !p-3 shadow-bubble">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-woof-pink to-woof-peach text-xl">
          🐾
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">Install woof.LY</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Add to home screen for full offline walks.</p>
        </div>
        <button
          onClick={async () => {
            try {
              installPrompt.prompt()
              const res = await installPrompt.userChoice
              if (res.outcome === 'accepted') setInstallPrompt(null)
            } catch (err) {
              console.warn(err)
            }
          }}
          className="btn-primary !px-3 !py-2 text-xs"
        >
          <Download size={15} /> Install
        </button>
        <button
          onClick={() => setInstallPrompt(null)}
          className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="dismiss"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

export function Toast() {
  const { toast, framed } = useApp()
  if (!toast) return null
  const kind = toast.kind === 'err' ? 'from-rose-500 to-orange-500' : 'from-woof-pink to-woof-peach'
  return (
    <div
      className={`bottom-20 left-1/2 z-50 -translate-x-1/2 animate-fadeIn ${
        framed ? 'absolute' : 'fixed'
      }`}
    >
      <div
        key={toast.id}
        className={`rounded-2xl bg-gradient-to-r ${kind} px-4 py-2.5 text-sm font-extrabold text-white shadow-bubble`}
      >
        {toast.msg}
      </div>
    </div>
  )
}