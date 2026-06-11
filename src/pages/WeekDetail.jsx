import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRoundWithScores, getRounds } from '../lib/db'

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function WeekDetail() {
  const { id } = useParams()
  const [scores, setScores] = useState([])
  const [round, setRound] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [scores, rounds] = await Promise.all([
          getRoundWithScores(id), getRounds(),
        ])
        setScores(scores)
        setRound(rounds.find(r => r.id === id))
      } finally { setLoading(false) }
    }
    load()
  }, [id])

  return (
    <div className="min-h-screen" style={{ background: 'var(--teal-dark)' }}>
      {/* Header */}
      <div className="px-4 pt-6 pb-4" style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
        <Link to="/" className="text-xs tracking-widest" style={{ color: 'var(--cream-dark)' }}>← STANDINGS</Link>
        <h1 className="font-display text-5xl tracking-widest mt-1" style={{ color: 'var(--amber)' }}>
          {round ? `WEEK ${round.week_number}` : 'ROUND'}
        </h1>
        {round && (
          <p className="text-sm tracking-wide" style={{ color: 'var(--cream-dark)' }}>
            {new Date(round.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {loading && <p className="text-center py-16" style={{ color: 'var(--cream-dark)' }}>Loading...</p>}

        {!loading && scores.length > 0 && (
          <>
            <div className="rounded-lg overflow-hidden shadow-xl" style={{ border: '2px solid var(--rust)' }}>
              <div className="px-4 py-2" style={{ background: 'var(--sunset)', color: 'var(--ink)' }}>
                <span className="font-display text-xl tracking-widest">SCORECARD</span>
              </div>
              <div className="scorecard">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--teal)', color: 'var(--cream)' }}>
                      <th className="font-display tracking-wider text-left px-3 py-2 text-xs">#</th>
                      <th className="font-display tracking-wider text-left px-3 py-2 text-xs">PLAYER</th>
                      <th className="font-display tracking-wider text-right px-3 py-2 text-xs">HCP</th>
                      <th className="font-display tracking-wider text-right px-3 py-2 text-xs">RAW</th>
                      <th className="font-display tracking-wider text-right px-3 py-2 text-xs">ADJ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((s, i) => (
                      <tr key={s.id} style={{
                        borderTop: '1px solid var(--cream-dark)',
                        background: i === 0 ? 'rgba(212,168,50,0.15)' : i % 2 === 0 ? 'var(--parchment)' : 'var(--cream)',
                      }}>
                        <td className="px-3 py-2.5 font-display text-base" style={{ color: i < 3 ? 'var(--rust)' : 'var(--ink-light)' }}>
                          {MEDAL[s.placement] || s.placement}
                        </td>
                        <td className="px-3 py-2.5 font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
                          {s.players?.name}
                          {s.dnf && <span className="ml-1.5 text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: '#7f1d1d', color: '#fca5a5' }}>DNF</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color: s.handicap < 0 ? '#16a34a' : 'var(--ink-light)' }}>
                          {s.handicap === 0 ? 'scratch' : s.handicap}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color: 'var(--ink-light)' }}>
                          {s.raw_score}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--teal)' }}>
                          {s.adjusted_score}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hole-by-hole breakdown if available */}
            {scores[0]?.hole_scores && (
              <div className="mt-6 rounded-lg overflow-hidden shadow-xl" style={{ border: '2px solid var(--rust)' }}>
                <div className="px-4 py-2" style={{ background: 'var(--teal)', color: 'var(--cream)' }}>
                  <span className="font-display text-lg tracking-widest">HOLE BY HOLE</span>
                </div>
                <div className="scorecard overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead>
                      <tr style={{ background: 'var(--cream-dark)', color: 'var(--ink)' }}>
                        <th className="text-left px-3 py-2 font-semibold tracking-wide sticky left-0" style={{ background: 'var(--cream-dark)' }}>
                          PLAYER
                        </th>
                        {[1,2,3,4,5,6,7,8,9].map(h => (
                          <th key={h} className="px-2 py-2 text-center font-display text-sm">{h}</th>
                        ))}
                        <th className="px-3 py-2 text-right font-display text-sm">TOT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scores.map((s, i) => {
                        const holes = s.hole_scores || []
                        return (
                          <tr key={s.id} style={{
                            borderTop: '1px solid var(--cream-dark)',
                            background: i % 2 === 0 ? 'var(--parchment)' : 'var(--cream)',
                          }}>
                            <td className="px-3 py-2 font-semibold sticky left-0" style={{ background: i % 2 === 0 ? 'var(--parchment)' : 'var(--cream)', color: 'var(--ink)' }}>
                              {s.players?.name}
                            </td>
                            {[1,2,3,4,5,6,7,8,9].map(h => (
                              <td key={h} className="px-2 py-2 text-center font-mono" style={{ color: 'var(--ink)' }}>
                                {holes[h-1] ?? '—'}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--teal)' }}>
                              {s.raw_score}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Next week handicaps */}
            <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <p className="font-display tracking-widest text-base mb-2" style={{ color: 'var(--amber)' }}>
                HANDICAPS EARNED FOR NEXT WEEK
              </p>
              {scores.map(s => {
                const next = s.placement === 1 ? 0
                  : s.placement === 2 ? -1
                  : s.placement === 3 ? -2
                  : s.placement === scores.length ? -4
                  : -3
                return (
                  <div key={s.id} className="flex justify-between py-0.5 text-sm">
                    <span style={{ color: 'var(--cream)' }}>{s.players?.name}</span>
                    <span className="font-mono" style={{ color: next < 0 ? '#4ade80' : 'var(--cream-dark)' }}>
                      {next === 0 ? 'scratch (0)' : next}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
