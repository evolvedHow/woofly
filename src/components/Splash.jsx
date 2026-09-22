import { PawPrint } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'

export default function Splash() {
  const { config } = useApp()
  return (
    <div className="grid min-h-dvh place-items-center bg-woof-ink">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid h-20 w-20 animate-wiggle place-items-center rounded-[1.75rem] bg-gradient-to-br from-woof-pink to-woof-peach shadow-bubble">
          <PawPrint size={40} className="text-white" strokeWidth={2.4} />
        </div>
        <p className="text-3xl font-black tracking-tight text-white">
          woof<span className="text-woof-pink">.LY</span>
        </p>
        <p className="text-xs font-bold text-slate-400">{config?.app?.tagline || 'waking the pack…'}</p>
      </div>
    </div>
  )
}