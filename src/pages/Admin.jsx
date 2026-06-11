import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getPlayers, addPlayer, getRounds, getLastRoundPlacements, submitRound } from '../lib/db'
import { getHandicapForPlacement, fillDnfHoles } from '../lib/scoring'

const HOLES = [1, 2, 3, 4, 5, 6, 7, 8, 9]

// ─── Step enum ───────────────────────────────────────────────────
const STEP = { SETUP: 'setup', SCORING: 'scoring', REVIEW: 'review' }

export default function Admin() {
  const navigate = useNavigate()
  const scorecardRef = useRef(null)

  const [players, setPlayers] = useState([])
  const [rounds, setRounds] = useState([])
  const [lastPlacements, setLastPlacements] = useState({})
  const [lastTotalPlayers, setLastTotalPlayers] = useState(0)

  const [step, setStep] = useState(STEP.SETUP)
  const [weekNumber, setWeekNumber] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [participating, setParticipating] = useState({})
  const [newPlayerName, setNewPlayerName] = useState('')
  const [addingPlayer, setAddingPlayer] = useState(false)

  // hole_scores[playerId][holeIndex 0-8] = strokes (number)
  const [holeScores, setHoleScores] = useState({})
  const [activeHole, setActiveHole] = useState(1) // which hole we're currently focusing

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function load() {
      const [players, rounds, lastData] = await Promise.all([
        getPlayers(), getRounds(), getLastRoundPlacements(),
      ])
      setPlayers(players)
      setRounds(rounds)
      if (lastData.placements) {
        setLastPlacements(lastData.placements)
        setLastTotalPlayers(lastData.totalPlayers)
      }
      setWeekNumber(rounds.length > 0 ? rounds[0].week_number + 1 : 1)
    }
    load()
  }, [])

  // ─── Derived ──────────────────────────────────────────────────
  const activePlayers = players.filter(p => participating[p.id])

  function getHandicap(playerId) {
    return getHandicapForPlacement(lastPlacements[playerId], lastTotalPlayers)
  }

  function playerRawTotal(playerId) {
    const holes = holeScores[playerId] || {}
    return Object.values(holes).reduce((sum, v) => sum + (v || 0), 0)
  }

  function playerHoleScore(playerId, holeIdx) {
    return holeScores[playerId]?.[holeIdx] ?? null
  }

  function allNineComplete() {
    return activePlayers.every(p =>
      HOLES.every((_, i) => (holeScores[p.id]?.[i] ?? null) !== null)
    )
  }

  function holesEnteredCount() {
    if (!activePlayers.length) return 0
    // count holes where ALL active players have a score
    return HOLES.filter((_, i) =>
      activePlayers.every(p => (holeScores[p.id]?.[i] ?? null) !== null)
    ).length
  }

  // ─── Handlers ─────────────────────────────────────────────────
  async function handleAddPlayer(e) {
    e.preventDefault()
    if (!newPlayerName.trim()) return
    setAddingPlayer(true)
    try {
      const p = await addPlayer(newPlayerName)
      setPlayers(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)))
      setNewPlayerName('')
    } catch (e) { setError('Failed to add player: ' + e.message) }
    finally { setAddingPlayer(false) }
  }

  function toggleParticipating(playerId) {
    setParticipating(prev => ({ ...prev, [playerId]: !prev[playerId] }))
  }

  function startScoring() {
    if (activePlayers.length < 2) {
      setError('Select at least 2 players.')
      return
    }
    setError(null)
    setHoleScores({})
    setActiveHole(1)
    setStep(STEP.SCORING)
  }

  function adjustScore(playerId, holeIdx, delta) {
    setHoleScores(prev => {
      const playerHoles = { ...(prev[playerId] || {}) }
      const current = playerHoles[holeIdx] ?? 0
      playerHoles[holeIdx] = Math.max(1, current + delta)
      return { ...prev, [playerId]: playerHoles }
    })
  }

  function setScore(playerId, holeIdx, val) {
    const n = parseInt(val, 10)
    if (isNaN(n) && val !== '') return
    setHoleScores(prev => {
      const playerHoles = { ...(prev[playerId] || {}) }
      if (val === '' || isNaN(n)) {
        delete playerHoles[holeIdx]
      } else {
        playerHoles[holeIdx] = Math.max(1, n)
      }
      return { ...prev, [playerId]: playerHoles }
    })
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const playerScores = activePlayers.map(p => {
        const holes = holeScores[p.id] || {}
        const holeArr = HOLES.map((_, i) => holes[i] ?? null)
        const isDnf = holeArr.some(s => s === null)
        if (isDnf) {
          const { filledHoles, rawScore } = fillDnfHoles(holeArr.map(s => s ?? 0))
          return { player_id: p.id, raw_score: rawScore, handicap: 0, hole_scores: filledHoles, dnf: true }
        }
        const raw_score = holeArr.reduce((s, v) => s + v, 0)
        return { player_id: p.id, raw_score, handicap: getHandicap(p.id), hole_scores: holeArr, dnf: false }
      })

      const round = await submitRound({
        weekNumber: parseInt(weekNumber, 10),
        date,
        playerScores,
      })
      setSuccess(true)
      setTimeout(() => navigate(`/week/${round.id}`), 1200)
    } catch (e) {
      setError('Submit failed: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Success ──────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--teal-dark)' }}>
        <div className="text-center">
          <div className="text-6xl mb-3">🪣</div>
          <p className="font-display text-4xl tracking-widest" style={{ color: 'var(--amber)' }}>Round Saved!</p>
          <p className="text-sm mt-2" style={{ color: 'var(--cream-dark)' }}>Loading results...</p>
        </div>
      </div>
    )
  }

  // ─── Setup Step ───────────────────────────────────────────────
  if (step === STEP.SETUP) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--teal-dark)' }}>
        <div className="h-1 w-full" style={{
          background: 'repeating-linear-gradient(90deg, var(--rust) 0px 8px, var(--amber) 8px 16px)',
        }} />
        <div className="px-4 pt-6 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Link to="/" className="text-xs tracking-widest" style={{ color: 'var(--cream-dark)' }}>← STANDINGS</Link>
          <h1 className="font-display text-5xl tracking-widest mt-1" style={{ color: 'var(--amber)' }}>
            NEW ROUND
          </h1>
        </div>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Round info */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--cream-dark)' }}>WEEK #</label>
              <input
                type="number"
                value={weekNumber}
                onChange={e => setWeekNumber(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--cream-dark)' }}>DATE</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }}
              />
            </div>
          </div>

          {/* Add player */}
          <div>
            <label className="block text-xs tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--cream-dark)' }}>ADD A PLAYER</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Player name"
                value={newPlayerName}
                onChange={e => setNewPlayerName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddPlayer(e)}
                className="flex-1 rounded px-3 py-2 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }}
              />
              <button
                onClick={handleAddPlayer}
                disabled={addingPlayer || !newPlayerName.trim()}
                className="px-4 py-2 rounded text-sm font-semibold tracking-wide disabled:opacity-40"
                style={{ background: 'var(--teal)', color: 'var(--cream)' }}
              >
                {addingPlayer ? '...' : 'Add'}
              </button>
            </div>
          </div>

          {/* Player selection */}
          <div>
            <label className="block text-xs tracking-widest mb-2 font-semibold" style={{ color: 'var(--cream-dark)' }}>
              WHO'S PLAYING TODAY?
            </label>
            {players.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--cream-dark)' }}>No players yet — add one above.</p>
            )}
            <div className="space-y-2">
              {players.map(p => {
                const isIn = !!participating[p.id]
                const hcp = getHandicap(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleParticipating(p.id)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-left transition-all"
                    style={{
                      background: isIn ? 'var(--teal)' : 'rgba(255,255,255,0.05)',
                      border: isIn ? '2px solid var(--amber)' : '2px solid transparent',
                      color: isIn ? 'var(--cream)' : 'var(--cream-dark)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: isIn ? 'var(--amber)' : 'rgba(255,255,255,0.15)', color: isIn ? 'var(--ink)' : 'transparent' }}>
                        ✓
                      </span>
                      <span className="font-semibold tracking-wide text-base">{p.name}</span>
                    </div>
                    <span className="text-xs font-mono" style={{ color: hcp < 0 ? '#4ade80' : 'var(--cream-dark)' }}>
                      hcp: {hcp === 0 ? 'scratch' : hcp}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <div className="rounded p-3 text-sm" style={{ background: '#7f1d1d', color: '#fca5a5' }}>{error}</div>
          )}

          <button
            onClick={startScoring}
            disabled={activePlayers.length < 2}
            className="w-full py-3.5 rounded-lg font-display text-2xl tracking-widest disabled:opacity-40 transition-opacity hover:opacity-90"
            style={{ background: 'var(--rust)', color: 'var(--cream)' }}
          >
            ⛳ START SCORING
          </button>
          {activePlayers.length < 2 && (
            <p className="text-center text-xs" style={{ color: 'var(--cream-dark)' }}>Select at least 2 players</p>
          )}
        </div>
      </div>
    )
  }

  // ─── Scoring Step ─────────────────────────────────────────────
  const completedHoles = holesEnteredCount()

  return (
    <div className="min-h-screen pb-32" style={{ background: 'var(--teal-dark)' }}>
      <div className="h-1 w-full" style={{
        background: 'repeating-linear-gradient(90deg, var(--rust) 0px 8px, var(--amber) 8px 16px)',
      }} />

      {/* Sticky header */}
      <div className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between"
        style={{ background: 'var(--teal-dark)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div>
          <button
            onClick={() => setStep(STEP.SETUP)}
            className="text-xs tracking-widest"
            style={{ color: 'var(--cream-dark)' }}
          >
            ← SETUP
          </button>
          <div className="font-display text-2xl tracking-widest mt-0.5" style={{ color: 'var(--amber)' }}>
            WEEK {weekNumber} · SCORING
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xs" style={{ color: 'var(--cream-dark)' }}>HOLES DONE</div>
          <div className="font-display text-3xl" style={{ color: completedHoles === 9 ? '#4ade80' : 'var(--cream)' }}>
            {completedHoles}/9
          </div>
        </div>
      </div>

      {/* Hole selector */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {HOLES.map(h => {
            const holeIdx = h - 1
            const allDone = activePlayers.every(p => (holeScores[p.id]?.[holeIdx] ?? null) !== null)
            const isActive = activeHole === h
            return (
              <button
                key={h}
                onClick={() => setActiveHole(h)}
                className="flex-shrink-0 w-9 h-9 rounded font-display text-lg tracking-wide transition-all"
                style={{
                  background: isActive ? 'var(--rust)' : allDone ? 'var(--teal)' : 'rgba(255,255,255,0.08)',
                  color: isActive ? 'var(--cream)' : allDone ? '#4ade80' : 'var(--cream-dark)',
                  border: isActive ? '2px solid var(--amber)' : '2px solid transparent',
                }}
              >
                {h}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active hole scoring */}
      <div className="px-4 py-4">
        <div className="font-display text-3xl tracking-widest mb-3" style={{ color: 'var(--amber)' }}>
          HOLE {activeHole}
        </div>

        <div className="space-y-2">
          {activePlayers.map(p => {
            const holeIdx = activeHole - 1
            const score = playerHoleScore(p.id, holeIdx)
            const hcp = getHandicap(p.id)
            return (
              <div
                key={p.id}
                className="rounded-xl overflow-hidden"
                style={{ background: score !== null ? 'var(--scorecard)' : 'rgba(255,255,255,0.05)', border: `2px solid ${score !== null ? 'var(--teal)' : 'rgba(255,255,255,0.1)'}` }}
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="font-semibold tracking-wide text-base" style={{ color: score !== null ? 'var(--ink)' : 'var(--cream)' }}>
                      {p.name}
                    </span>
                    <span className="text-xs font-mono ml-2" style={{ color: hcp < 0 ? '#16a34a' : '#888' }}>
                      hcp {hcp === 0 ? 'scratch' : hcp}
                    </span>
                  </div>
                  {/* +/- controls */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => adjustScore(p.id, holeIdx, -1)}
                      className="w-10 h-10 rounded-full font-display text-2xl flex items-center justify-center transition-colors"
                      style={{ background: 'var(--rust)', color: 'var(--cream)' }}
                    >−</button>
                    <span
                      className="font-display text-3xl w-8 text-center"
                      style={{ color: score !== null ? 'var(--ink)' : 'var(--cream-dark)' }}
                    >
                      {score ?? '—'}
                    </span>
                    <button
                      onClick={() => adjustScore(p.id, holeIdx, +1)}
                      className="w-10 h-10 rounded-full font-display text-2xl flex items-center justify-center transition-colors"
                      style={{ background: 'var(--teal)', color: 'var(--cream)' }}
                    >+</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Hole nav buttons */}
        <div className="flex gap-3 mt-4">
          {activeHole > 1 && (
            <button
              onClick={() => setActiveHole(h => h - 1)}
              className="flex-1 py-2.5 rounded-lg font-display tracking-widest text-base"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream-dark)' }}
            >
              ← HOLE {activeHole - 1}
            </button>
          )}
          {activeHole < 9 && (
            <button
              onClick={() => setActiveHole(h => h + 1)}
              className="flex-1 py-2.5 rounded-lg font-display tracking-widest text-base"
              style={{ background: 'var(--teal)', color: 'var(--cream)' }}
            >
              HOLE {activeHole + 1} →
            </button>
          )}
        </div>
      </div>

      {/* ── Live Scorecard ─────────────────────────────────────── */}
      <div ref={scorecardRef} className="px-4 mt-2">
        <div className="font-display text-lg tracking-widest mb-2" style={{ color: 'var(--cream-dark)' }}>
          SCORECARD
        </div>
        <div className="rounded-lg overflow-hidden shadow-lg" style={{ border: '2px solid var(--rust)' }}>
          <div className="overflow-x-auto">
            <div className="scorecard">
              <table className="w-full text-xs min-w-max">
                <thead>
                  <tr style={{ background: 'var(--teal)', color: 'var(--cream)' }}>
                    <th className="text-left px-3 py-2 font-semibold tracking-wide sticky left-0" style={{ background: 'var(--teal)', minWidth: 80 }}>
                      PLAYER
                    </th>
                    {HOLES.map(h => (
                      <th
                        key={h}
                        className="px-2 py-2 text-center font-display text-sm cursor-pointer"
                        style={{ color: activeHole === h ? 'var(--amber)' : 'var(--cream)', minWidth: 32 }}
                        onClick={() => setActiveHole(h)}
                      >
                        {h}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-display text-sm" style={{ minWidth: 40 }}>TTL</th>
                  </tr>
                </thead>
                <tbody>
                  {activePlayers.map((p, i) => {
                    const hcp = getHandicap(p.id)
                    const raw = playerRawTotal(p.id)
                    return (
                      <tr key={p.id} style={{
                        borderTop: '1px solid var(--cream-dark)',
                        background: i % 2 === 0 ? 'var(--parchment)' : 'var(--cream)',
                      }}>
                        <td className="px-3 py-2 font-semibold sticky left-0" style={{ background: i % 2 === 0 ? 'var(--parchment)' : 'var(--cream)', color: 'var(--ink)', minWidth: 80 }}>
                          {p.name}
                        </td>
                        {HOLES.map((h, hi) => {
                          const s = playerHoleScore(p.id, hi)
                          const isCur = activeHole === h
                          return (
                            <td
                              key={h}
                              className="px-1 py-2 text-center font-mono cursor-pointer"
                              style={{
                                color: s !== null ? 'var(--ink)' : 'var(--cream-dark)',
                                background: isCur ? 'rgba(201,75,26,0.12)' : 'transparent',
                                fontWeight: isCur ? 700 : 400,
                                minWidth: 32,
                              }}
                              onClick={() => setActiveHole(h)}
                            >
                              {s ?? '·'}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: raw > 0 ? 'var(--teal)' : 'var(--cream-dark)' }}>
                          {raw > 0 ? raw : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ── Finish Round ────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-4 z-30"
        style={{ background: 'linear-gradient(to top, var(--teal-dark) 70%, transparent)' }}>
        {error && (
          <div className="rounded p-2 text-xs mb-2 text-center" style={{ background: '#7f1d1d', color: '#fca5a5' }}>{error}</div>
        )}
        {!allNineComplete() && (
          <p className="text-center text-xs mb-2" style={{ color: 'var(--cream-dark)' }}>
            {9 - completedHoles} hole{9 - completedHoles !== 1 ? 's' : ''} remaining before you can finish
          </p>
        )}
        <button
          onClick={handleSubmit}
          disabled={!allNineComplete() || submitting}
          className="w-full py-4 rounded-xl font-display text-2xl tracking-widest disabled:opacity-30 transition-opacity"
          style={{ background: allNineComplete() ? 'var(--rust)' : 'rgba(255,255,255,0.1)', color: 'var(--cream)' }}
        >
          {submitting ? 'SAVING...' : '🏁 FINISH ROUND'}
        </button>
      </div>
    </div>
  )
}
