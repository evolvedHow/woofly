import { NavLink } from 'react-router-dom'
import { PawPrint, Camera, QrCode, Award, Settings as SettingsIcon, Bot } from 'lucide-react'

const TABS = [
  { to: '/walk', label: 'Walk', icon: PawPrint },
  { to: '/photos', label: 'Photos', icon: Camera },
  { to: '/passport', label: 'Passport', icon: QrCode },
  { to: '/badges', label: 'Badges', icon: Award },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export default function BottomNav({ showAi }) {
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 -translate-x-1/2 w-full max-w-md border-t border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-extrabold transition ${
                isActive ? 'text-woof-pink dark:text-woof-pink' : 'text-slate-400 dark:text-slate-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 h-1 w-8 rounded-full bg-gradient-to-r from-woof-pink to-woof-peach" />
                )}
                <Icon size={21} strokeWidth={2.4} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function AiChatLink({ className = '' }) {
  return (
    <NavLink
      to="/ai"
      className={`fixed right-4 bottom-24 z-40 flex items-center gap-1.5 rounded-full bg-woof-ink dark:bg-white text-white dark:text-woof-ink px-4 py-2.5 text-xs font-extrabold shadow-card active:scale-95 transition ${className}`}
    >
      <Bot size={16} /> Woof AI
    </NavLink>
  )
}