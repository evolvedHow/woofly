import { useEffect, useState } from 'react'

const mqDesktop = () => window.matchMedia('(min-width: 768px) and (pointer: fine)')
const mqStandalone = () => window.matchMedia('(display-mode: standalone)')

const isFramed = () => {
  if (typeof window === 'undefined' || typeof matchMedia === 'undefined') return false
  return mqDesktop().matches && !mqStandalone().matches
}

export function useDesktopFrame() {
  const [framed, setFramed] = useState(isFramed)

  useEffect(() => {
    const a = mqDesktop()
    const b = mqStandalone()
    const update = () => setFramed(a.matches && !b.matches)
    a.addEventListener('change', update)
    b.addEventListener('change', update)
    return () => {
      a.removeEventListener('change', update)
      b.removeEventListener('change', update)
    }
  }, [])

  return framed
}