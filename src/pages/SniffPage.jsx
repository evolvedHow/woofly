import { useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { PawPrint, QrCode } from 'lucide-react'
import { addFriendFromCode } from '../lib/friends.js'
import { useApp } from '../context/AppContext.jsx'

export default function SniffPage() {
  const [params] = useSearchParams()
  const { notify, config } = useApp()
  const [state, setState] = useState('reading')
  const [friend, setFriend] = useState(null)
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    const data = params.get('data')
    if (!data) {
      setState('empty')
      return
    }
    done.current = true
    ;(async () => {
      try {
        const res = await addFriendFromCode(data)
        setFriend(res.friend)
        setState(res.added ? 'added' : 'already')
        notify(res.added ? `${res.friend.petName} is now in your pack! 🎉` : `${res.friend.petName} is already your friend.`)
      } catch (err) {
        setState('bad')
        notify(err.message, 'err')
      }
    })()
  }, [params, notify])

  return (
    <div className="animate-fadeIn">
      <div className="card text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-woof-pink to-woof-peach animate-wiggle">
          {state === 'read' || state === 'already' ? <QrCode size={28} className="text-white" /> : <PawPrint size={28} className="text-white" />}
        </div>

        {state === 'reading' && <p className="text-sm font-bold text-slate-400">Sniffing the code…</p>}
        {state === 'empty' && <p className="text-sm font-bold text-slate-400">Nothing to sniff here. Ask a friend to share their passport link.</p>}
        {state === 'bad' && <p className="text-sm font-bold text-rose-500">That passport code is broken or expired.</p>}

        {state === 'added' && friend && (
          <>
            <p className="mb-1 text-3xl">{friend.avatar || '🐾'}</p>
            <h1 className="mb-1 text-xl font-black">{friend.petName}</h1>
            <p className="mb-4 text-xs font-bold text-slate-400">
              {friend.breed || 'mystery breed'} has joined your pack. Welcome home.
            </p>
            <Link to="/passport" className="btn-primary w-full">
              See my pack
            </Link>
          </>
        )}
        {state === 'already' && friend && (
          <>
            <p className="mb-1 text-3xl">{friend.avatar || '🐾'}</p>
            <h1 className="mb-1 text-xl font-black">{friend.petName}</h1>
            <p className="mb-4 text-xs font-bold text-slate-400">Already your friend — they just gave your scent a 10/10.</p>
            <Link to="/passport" className="btn-primary w-full">
              See my pack
            </Link>
          </>
        )}

        <Link to="/walk" className="mt-3 block text-xs font-extrabold text-woof-pink">
          Back to walking →
        </Link>
      </div>
    </div>
  )
}