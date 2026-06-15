import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPlayers, getAllScores, getRounds } from '../lib/db'
import { computeStandings } from '../lib/scoring'

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function Leaderboard() {
  const [standings, setStandings] = useState([])
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [players, scores, rounds] = await Promise.all([
          getPlayers(), getAllScores(), getRounds(),
        ])
        setStandings(computeStandings(scores, players, rounds))
        setRounds(rounds)
      } catch (e) { setError(e.message) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  return (
    <div className="min-h-screen" style={{ background: 'var(--teal-dark)' }}>

      {/* Hero Header */}
      <div className="relative overflow-hidden">
        {/* Sunset stripe behind header */}
        <div className="absolute inset-0 opacity-20" style={{ background: 'var(--sunset)' }} />
        <div className="relative px-4 pt-8 pb-6 text-center">
          {/* Logo */}
          <img
            src="/bgi-logo.png"
            alt="BGI Logo"
            className="w-36 h-36 mx-auto mb-2 drop-shadow-lg object-contain"
            onError={e => { e.target.style.display = 'none' }}
          />
          <h1 className="font-display text-5xl tracking-widest" style={{ color: 'var(--cream)' }}>
            THE BUCKET GOLF
          </h1>
          <div
            className="font-display text-2xl tracking-widest mt-0.5"
            style={{ color: 'var(--amber)' }}
          >
            INVITATIONAL
          </div>
          <div
            className="inline-block mt-2 px-4 py-0.5 text-sm font-semibold tracking-widest uppercase"
            style={{ background: 'var(--rust)', color: 'var(--cream)', borderRadius: 2 }}
          >
            2026
          </div>
        </div>
      </div>

      {/* Rope divider */}
      <div className="h-2 w-full" style={{
        background: 'repeating-linear-gradient(90deg, var(--rust) 0px 8px, var(--amber) 8px 16px)',
        opacity: 0.7
      }} />

      <div className="max-w-lg mx-auto px-4 py-6">

        {/* CTAs */}
        <div className="flex gap-2 mb-6">
          <Link to="/admin"
            className="flex-1 flex items-center justify-center py-3 font-display text-xl tracking-widest transition-opacity hover:opacity-90"
            style={{ background: 'var(--rust)', color: 'var(--cream)', borderRadius: 6 }}>
            ⛳ ENTER ROUND
          </Link>
          <Link to="/course"
            className="flex items-center justify-center px-5 py-3 font-display text-xl tracking-widest transition-opacity hover:opacity-90"
            style={{ background: 'var(--teal)', color: 'var(--cream)', borderRadius: 6 }}>
            🗺️
          </Link>
        </div>

        {loading && (
          <div className="text-center py-16" style={{ color: 'var(--cream-dark)' }}>
            Loading standings...
          </div>
        )}

        {error && (
          <div className="rounded p-4 text-sm text-center" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
            {error.includes('fetch') || error.includes('Failed')
              ? 'Could not reach database — check your Supabase keys in .env.local'
              : error}
          </div>
        )}

        {!loading && !error && standings.length === 0 && (
          <div className="text-center py-16" style={{ color: 'var(--cream-dark)' }}>
            <div className="text-5xl mb-3">🪣</div>
            <p className="font-display text-3xl tracking-wide" style={{ color: 'var(--amber)' }}>
              No rounds yet
            </p>
            <p className="mt-2 text-sm">Hit "Start Round" to kick things off.</p>
          </div>
        )}

        {!loading && standings.length > 0 && (
          <>
            {/* Standings scorecard */}
            <div className="rounded-lg overflow-hidden shadow-xl" style={{ border: '2px solid var(--rust)' }}>
              {/* Card header */}
              <div
                className="px-4 py-2 flex items-center justify-between"
                style={{ background: 'var(--sunset)', color: 'var(--ink)' }}
              >
                <span className="font-display text-xl tracking-widest">STANDINGS</span>
                <span className="text-xs font-semibold tracking-wide opacity-70">{rounds.length} ROUNDS PLAYED</span>
              </div>

              {/* Table */}
              <div className="scorecard">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--teal)', color: 'var(--cream)' }}>
                      <th className="font-display tracking-wider text-left px-3 py-2 text-xs">#</th>
                      <th className="font-display tracking-wider text-left px-3 py-2 text-xs">PLAYER</th>
                      <th className="font-display tracking-wider text-right px-3 py-2 text-xs">PTS</th>
                      <th className="font-display tracking-wider text-center px-2 py-2 text-xs">WINS</th>
                      <th className="font-display tracking-wider text-center px-2 py-2 text-xs">DNF</th>
                      <th className="font-display tracking-wider text-right px-3 py-2 text-xs">ADJ</th>
                      <th className="font-display tracking-wider text-center px-2 py-2 text-xs">RAW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((s, i) => (
                      <tr
                        key={s.player.id}
                        style={{
                          borderTop: '1px solid var(--cream-dark)',
                          background: i === 0
                            ? 'rgba(212,168,50,0.15)'
                            : i % 2 === 0 ? 'var(--parchment)' : 'var(--cream)',
                        }}
                      >
                        <td className="px-3 py-2.5 font-display text-base" style={{ color: i < 3 ? 'var(--rust)' : 'var(--ink-light)' }}>
                          {MEDAL[s.standing] || s.standing}
                        </td>
                        <td className="px-3 py-2.5 font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
                          {s.player.name}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--rust)' }}>
                          {s.totalPoints ?? 0}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-xs" style={{ color: 'var(--ink-light)' }}>
                          {s.wins || '—'}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-xs" style={{ color: s.dnfRounds > 0 ? '#dc2626' : 'var(--ink-light)' }}>
                          {s.dnfRounds > 0 ? s.dnfRounds : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color: 'var(--ink-light)' }}>
                          {s.totalAdjusted}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-xs" style={{ color: 'var(--ink-light)' }}>
                          {s.totalRaw}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 text-xs space-y-0.5" style={{ background: 'var(--cream-dark)', color: 'var(--ink-light)' }}>
                  <div>PTS per round: 1st→10 · 2nd→7 · 3rd→5 · 4th→3 · 5th→1 · 6th+/DNF→0 · ties share full points</div>
                  <div>Handicaps: 1st→0 · 2nd→−1 · 3rd→−2 · others→−3 · last→−4 · new→−3</div>
                  <div>DNF / missed holes: +5 strokes per unplayed hole · no handicap · 0 points</div>
                </div>
              </div>
            </div>

            {/* Past rounds */}
            {rounds.length > 0 && (
              <div className="mt-6">
                <div className="font-display text-lg tracking-widest mb-2" style={{ color: 'var(--amber)' }}>
                  PAST ROUNDS
                </div>
                <div className="flex flex-col gap-1.5">
                  {rounds.map(r => (
                    <Link
                      key={r.id}
                      to={`/week/${r.id}`}
                      className="flex justify-between items-center px-4 py-2.5 rounded transition-colors"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--cream)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    >
                      <span className="font-display tracking-wide text-lg">
                        Week {r.week_number}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--cream-dark)' }}>
                        {new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}