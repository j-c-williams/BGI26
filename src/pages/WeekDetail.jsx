import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRoundWithScores, getRounds, editRound } from '../lib/db'
import { PLACEMENT_POINTS } from '../lib/scoring'

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function WeekDetail() {
  const { id } = useParams()
  const [scores, setScores] = useState([])
  const [round, setRound] = useState(null)
  const [loading, setLoading] = useState(true)

  // Edit mode state
  const [editing, setEditing] = useState(false)
  const [editScores, setEditScores] = useState({})
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState(null)

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

  function startEditing() {
    const initial = {}
    scores.forEach(s => {
      initial[s.player_id] = {
        raw_score: s.raw_score,
        handicap: s.handicap,
        dnf: s.dnf || false,
        hole_scores: s.hole_scores,
        player_id: s.player_id,
      }
    })
    setEditScores(initial)
    setEditing(true)
    setEditError(null)
  }

  function cancelEditing() {
    setEditing(false)
    setEditError(null)
  }

  async function saveEdits() {
    setSaving(true)
    setEditError(null)
    try {
      const playerScores = Object.values(editScores).map(s => ({
        player_id: s.player_id,
        raw_score: parseInt(s.raw_score, 10),
        handicap: parseInt(s.handicap, 10),
        hole_scores: s.hole_scores,
        dnf: s.dnf,
      }))
      await editRound(id, playerScores)
      const updated = await getRoundWithScores(id)
      setScores(updated)
      setEditing(false)
    } catch (e) {
      setEditError('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const ranked = scores
    .slice()
    .sort((a, b) => a.placement - b.placement)
    .map(s => ({ ...s, displayPlacement: s.placement }))

  const lastPlacement = ranked.filter(s => !s.dnf).at(-1)?.placement

  return (
    <div className="min-h-screen" style={{ background: 'var(--teal-dark)' }}>
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-start justify-between" style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
        <div>
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
        {!loading && scores.length > 0 && !editing && (
          <button onClick={startEditing}
            className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold tracking-wide"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream-dark)', border: '1px solid rgba(255,255,255,0.15)' }}>
            ✏️ Edit
          </button>
        )}
        {editing && (
          <div className="flex gap-2 mt-2">
            <button onClick={cancelEditing}
              className="px-3 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream-dark)' }}>
              Cancel
            </button>
            <button onClick={saveEdits} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--rust)', color: 'var(--cream)' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {loading && <p className="text-center py-16" style={{ color: 'var(--cream-dark)' }}>Loading...</p>}

        {/* ── EDIT MODE ─────────────────────────────────────────── */}
        {!loading && editing && (
          <div className="space-y-4">
            <div className="rounded-lg overflow-hidden" style={{ border: '2px solid var(--amber)' }}>
              <div className="px-4 py-2 font-display tracking-widest text-sm" style={{ background: 'var(--amber)', color: 'var(--ink)' }}>
                EDITING SCORES — changes recalculate all placements, points & handicaps
              </div>
              <div className="space-y-0">
                {scores.map((s, i) => {
                  const ed = editScores[s.player_id] || {}
                  const adjPreview = !ed.dnf
                    ? (parseInt(ed.raw_score || 0) + parseInt(ed.handicap || 0))
                    : parseInt(ed.raw_score || 0)
                  return (
                    <div key={s.id} style={{
                      borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                      background: 'rgba(255,255,255,0.03)',
                      padding: '12px 16px',
                    }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold" style={{ color: 'var(--cream)' }}>{s.players?.name}</span>
                        <label className="flex items-center gap-2 text-xs cursor-pointer"
                          style={{ color: ed.dnf ? '#fca5a5' : 'var(--cream-dark)' }}>
                          <input type="checkbox" checked={!!ed.dnf}
                            onChange={e => setEditScores(prev => ({
                              ...prev,
                              [s.player_id]: { ...prev[s.player_id], dnf: e.target.checked }
                            }))} />
                          DNF
                        </label>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-xs mb-1" style={{ color: 'var(--cream-dark)' }}>Raw strokes</label>
                          <input type="number" min="0" value={ed.raw_score ?? ''}
                            onChange={e => setEditScores(prev => ({
                              ...prev,
                              [s.player_id]: { ...prev[s.player_id], raw_score: e.target.value }
                            }))}
                            className="w-full rounded px-3 py-2 text-sm font-mono outline-none"
                            style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }} />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs mb-1" style={{ color: 'var(--cream-dark)' }}>Handicap applied</label>
                          <input type="number" value={ed.handicap ?? ''}
                            onChange={e => setEditScores(prev => ({
                              ...prev,
                              [s.player_id]: { ...prev[s.player_id], handicap: e.target.value }
                            }))}
                            className="w-full rounded px-3 py-2 text-sm font-mono outline-none"
                            style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }} />
                        </div>
                        <div className="flex flex-col justify-end">
                          <label className="block text-xs mb-1" style={{ color: 'var(--cream-dark)' }}>Adj</label>
                          <div className="px-3 py-2 text-sm font-mono rounded"
                            style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--teal-light)' }}>
                            {isNaN(adjPreview) ? '—' : adjPreview}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {editError && (
              <div className="rounded p-3 text-sm" style={{ background: '#7f1d1d', color: '#fca5a5' }}>{editError}</div>
            )}

            <p className="text-xs text-center" style={{ color: 'var(--cream-dark)' }}>
              Saving will recalculate placements, points, and handicaps for next week based on the new scores.
            </p>
          </div>
        )}

        {/* ── VIEW MODE ─────────────────────────────────────────── */}
        {!loading && !editing && scores.length > 0 && (
          <>
            {/* Scorecard */}
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
                      <th className="font-display tracking-wider text-right px3 py-2 text-xs">PTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((s, i) => {
                      const dp = s.displayPlacement
                      const isTied = ranked.filter(r => r.displayPlacement === dp && !r.dnf).length > 1
                      const medal = MEDAL[dp]
                      const label = s.dnf ? dp : medal ? (isTied ? medal + '=' : medal) : (isTied ? `T${dp}` : dp)
                      return (
                        <tr key={s.id} style={{
                          borderTop: '1px solid var(--cream-dark)',
                          background: i === 0 ? 'rgba(212,168,50,0.15)' : i % 2 === 0 ? 'var(--parchment)' : 'var(--cream)',
                        }}>
                          <td className="px-3 py-2.5 font-display text-base" style={{ color: dp <= 3 ? 'var(--rust)' : 'var(--ink-light)' }}>
                            {label}
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
                          <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--rust)' }}>
                            {s.dnf ? 0 : (PLACEMENT_POINTS[dp] ?? 0)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hole-by-hole breakdown */}
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
                      {ranked.map((s, i) => {
                        const holes = s.hole_scores || []
                        return (
                          <tr key={s.id} style={{
                            borderTop: '1px solid var(--cream-dark)',
                            background: i % 2 === 0 ? 'var(--parchment)' : 'var(--cream)',
                          }}>
                            <td className="px-3 py-2 font-semibold sticky left-0"
                              style={{ background: i % 2 === 0 ? 'var(--parchment)' : 'var(--cream)', color: 'var(--ink)' }}>
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
              {ranked.map(s => {
                const dp = s.displayPlacement
                const next = s.dnf ? -3
                  : dp === 1 ? 0
                  : dp === 2 ? -1
                  : dp === 3 ? -2
                  : s.placement === lastPlacement ? -4
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