import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getPlayers, addPlayer, getRounds, getLastRoundPlacements, submitRound,
         saveInProgressRound, loadInProgressRound, clearInProgressRound } from '../lib/db'
import { getHandicapForPlacement, fillDnfHoles } from '../lib/scoring'

const HOLES = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const LOCAL_KEY = 'bgi_inprogress'

const STEP = { SETUP: 'setup', SCORING: 'scoring', RESUME: 'resume' }

// Save to both localStorage (instant) and Supabase (cross-device)
async function persistState(state) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)) } catch {}
  await saveInProgressRound(state)
}

async function clearPersistedState() {
  try { localStorage.removeItem(LOCAL_KEY) } catch {}
  await clearInProgressRound()
}

export default function Admin() {
  const navigate = useNavigate()
  const scorecardRef = useRef(null)
  const saveTimer = useRef(null)

  const [players, setPlayers] = useState([])
  const [lastPlacements, setLastPlacements] = useState({})
  const [lastTotalPlayers, setLastTotalPlayers] = useState(0)

  const [step, setStep] = useState(STEP.SETUP)
  const [weekNumber, setWeekNumber] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [participating, setParticipating] = useState({})
  const [newPlayerName, setNewPlayerName] = useState('')
  const [addingPlayer, setAddingPlayer] = useState(false)

  const [holeScores, setHoleScores] = useState({})
  const [dnfPlayers, setDnfPlayers] = useState({})
  const [activeHole, setActiveHole] = useState(1)

  // Late player state
  const [latePlayerOpen, setLatePlayerOpen] = useState(false)
  const [latePlayerName, setLatePlayerName] = useState('')
  const [latePlayerSelect, setLatePlayerSelect] = useState('')
  const [addingLate, setAddingLate] = useState(false)

  // Resume prompt state
  const [savedState, setSavedState] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // ─── Load players + check for in-progress round ───────────────
  useEffect(() => {
    async function load() {
      const [players, rounds, lastData] = await Promise.all([
        getPlayers(), getRounds(), getLastRoundPlacements(),
      ])
      setPlayers(players)
      if (lastData.placements) {
        setLastPlacements(lastData.placements)
        setLastTotalPlayers(lastData.totalPlayers)
      }

      // Check for saved in-progress round (Supabase first, fall back to localStorage)
      let saved = null
      try { saved = await loadInProgressRound() } catch {}
      if (!saved) {
        try {
          const local = localStorage.getItem(LOCAL_KEY)
          if (local) saved = JSON.parse(local)
        } catch {}
      }

      if (saved) {
        setSavedState(saved)
        setStep(STEP.RESUME)
      } else {
        setWeekNumber(rounds.length > 0 ? rounds[0].week_number + 1 : 1)
      }
    }
    load()
  }, [])

  // ─── Debounced auto-save while scoring ────────────────────────
  useEffect(() => {
    if (step !== STEP.SCORING) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      persistState({ step, weekNumber, date, participating, holeScores, dnfPlayers, activeHole })
    }, 1000) // save 1s after last change to avoid hammering Supabase
    return () => clearTimeout(saveTimer.current)
  }, [step, weekNumber, date, participating, holeScores, dnfPlayers, activeHole])

  // ─── Derived ──────────────────────────────────────────────────
  const activePlayers = players.filter(p => participating[p.id])

  // Sort active players by current adjusted score ascending (leader first)
  const sortedActivePlayers = [...activePlayers].sort((a, b) => {
    const aAdj = playerCurrentAdjusted(a.id)
    const bAdj = playerCurrentAdjusted(b.id)
    if (aAdj === null && bAdj === null) return 0
    if (aAdj === null) return 1
    if (bAdj === null) return -1
    return aAdj - bAdj
  })

  function playerCurrentAdjusted(playerId) {
    const raw = playerRawTotal(playerId)
    if (raw === 0 && !Object.keys(holeScores[playerId] || {}).length) return null
    return raw + getHandicap(playerId)
  }

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
      dnfPlayers[p.id] ||
      HOLES.every((_, i) => (holeScores[p.id]?.[i] ?? null) !== null)
    )
  }

  function holesEnteredCount() {
    if (!activePlayers.length) return 0
    return HOLES.filter((_, i) =>
      activePlayers.every(p => dnfPlayers[p.id] || (holeScores[p.id]?.[i] ?? null) !== null)
    ).length
  }

  // ─── Handlers ─────────────────────────────────────────────────
  function restoreSavedRound() {
    const s = savedState
    setStep(s.step)
    setWeekNumber(s.weekNumber)
    setDate(s.date)
    setParticipating(s.participating)
    setHoleScores(s.holeScores)
    setDnfPlayers(s.dnfPlayers)
    setActiveHole(s.activeHole)
    setSavedState(null)
  }

  async function discardSavedRound() {
    await clearPersistedState()
    setSavedState(null)
    const rounds = await getRounds()
    setWeekNumber(rounds.length > 0 ? rounds[0].week_number + 1 : 1)
    setStep(STEP.SETUP)
  }

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
    if (activePlayers.length < 2) { setError('Select at least 2 players.'); return }
    setError(null)
    setHoleScores({})
    setDnfPlayers({})
    setActiveHole(1)
    setLatePlayerOpen(false)
    setLatePlayerName('')
    setLatePlayerSelect('')
    setStep(STEP.SCORING)
  }

  function adjustScore(playerId, holeIdx, delta) {
    setHoleScores(prev => {
      const playerHoles = { ...(prev[playerId] || {}) }
      const current = playerHoles[holeIdx] ?? -1
      playerHoles[holeIdx] = Math.max(0, current + delta)
      return { ...prev, [playerId]: playerHoles }
    })
  }

  function toggleDnf(playerId) {
    setDnfPlayers(prev => {
      const nowDnf = !prev[playerId]
      if (nowDnf) {
        setHoleScores(prev => { const next = { ...prev }; delete next[playerId]; return next })
      }
      return { ...prev, [playerId]: nowDnf }
    })
  }

  async function handleAddLatePlayer() {
    setAddingLate(true)
    try {
      let player
      if (latePlayerSelect) {
        player = players.find(p => p.id === latePlayerSelect)
      } else if (latePlayerName.trim()) {
        player = await addPlayer(latePlayerName.trim())
        setPlayers(prev => [...prev, player].sort((a, b) => a.name.localeCompare(b.name)))
        setLatePlayerName('')
      } else return

      setParticipating(prev => ({ ...prev, [player.id]: true }))

      // Pre-fill holes before current hole with DNF penalty (5)
      setHoleScores(prev => {
        const playerHoles = {}
        for (let i = 0; i < activeHole - 1; i++) {
          playerHoles[i] = 5
        }
        return { ...prev, [player.id]: playerHoles }
      })

      setLatePlayerSelect('')
      setLatePlayerOpen(false)
    } catch (e) {
      setError('Failed to add player: ' + e.message)
    } finally {
      setAddingLate(false)
    }
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const playerScores = activePlayers.map(p => {
        const holes = holeScores[p.id] || {}
        const holeArr = HOLES.map((_, i) => holes[i] ?? null)
        const isDnf = !!dnfPlayers[p.id] || holeArr.some(s => s === null)
        if (isDnf) {
          const { filledHoles, rawScore } = fillDnfHoles(holeArr.map(s => s ?? 0))
          return { player_id: p.id, raw_score: rawScore, handicap: 0, hole_scores: filledHoles, dnf: true }
        }
        const raw_score = holeArr.reduce((s, v) => s + v, 0)
        return { player_id: p.id, raw_score, handicap: getHandicap(p.id), hole_scores: holeArr, dnf: false }
      })

      const round = await submitRound({ weekNumber: parseInt(weekNumber, 10), date, playerScores })
      await clearPersistedState()
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

  // ─── Resume Prompt ────────────────────────────────────────────
  if (step === STEP.RESUME) {
    const s = savedState
    const resumePlayers = players.filter(p => s?.participating?.[p.id])
    const holesIn = s ? HOLES.filter((_, i) =>
      resumePlayers.every(p => (s.holeScores?.[p.id]?.[i] ?? null) !== null)
    ).length : 0

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--teal-dark)' }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">⏸️</div>
            <h1 className="font-display text-4xl tracking-widest" style={{ color: 'var(--amber)' }}>
              ROUND IN PROGRESS
            </h1>
            <p className="text-sm mt-2" style={{ color: 'var(--cream-dark)' }}>
              Week {s?.weekNumber} · {holesIn}/9 holes completed
            </p>
            {resumePlayers.length > 0 && (
              <p className="text-sm mt-1" style={{ color: 'var(--cream-dark)' }}>
                {resumePlayers.map(p => p.name).join(', ')}
              </p>
            )}
          </div>

          <button
            onClick={restoreSavedRound}
            className="w-full py-4 rounded-xl font-display text-2xl tracking-widest mb-3"
            style={{ background: 'var(--teal)', color: 'var(--cream)' }}
          >
            ▶ RESUME ROUND
          </button>

          <button
            onClick={() => {
              if (window.confirm(
                '⚠️ DISCARD IN-PROGRESS ROUND?\n\n' +
                'This will permanently delete all scores entered so far for Week ' + s?.weekNumber + '.\n\n' +
                'This cannot be undone. Are you absolutely sure?'
              )) discardSavedRound()
            }}
            className="w-full py-3 rounded-xl font-display text-lg tracking-widest"
            style={{ background: 'rgba(127,29,29,0.4)', color: '#fca5a5', border: '1px solid #7f1d1d' }}
          >
            ✕ DISCARD & START FRESH
          </button>
          <p className="text-center text-xs mt-2" style={{ color: '#f87171' }}>
            Discard permanently deletes all scores entered so far
          </p>
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
          <h1 className="font-display text-5xl tracking-widest mt-1" style={{ color: 'var(--amber)' }}>NEW ROUND</h1>
        </div>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--cream-dark)' }}>WEEK #</label>
              <input type="number" value={weekNumber} onChange={e => setWeekNumber(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }} />
            </div>
            <div className="flex-1">
              <label className="block text-xs tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--cream-dark)' }}>DATE</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }} />
            </div>
          </div>

          <div>
            <label className="block text-xs tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--cream-dark)' }}>ADD A PLAYER</label>
            <div className="flex gap-2">
              <input type="text" placeholder="Player name" value={newPlayerName}
                onChange={e => setNewPlayerName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddPlayer(e)}
                className="flex-1 rounded px-3 py-2 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }} />
              <button onClick={handleAddPlayer} disabled={addingPlayer || !newPlayerName.trim()}
                className="px-4 py-2 rounded text-sm font-semibold tracking-wide disabled:opacity-40"
                style={{ background: 'var(--teal)', color: 'var(--cream)' }}>
                {addingPlayer ? '...' : 'Add'}
              </button>
            </div>
          </div>

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
                  <button key={p.id} type="button" onClick={() => toggleParticipating(p.id)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-left transition-all"
                    style={{
                      background: isIn ? 'var(--teal)' : 'rgba(255,255,255,0.05)',
                      border: isIn ? '2px solid var(--amber)' : '2px solid transparent',
                      color: isIn ? 'var(--cream)' : 'var(--cream-dark)',
                    }}>
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: isIn ? 'var(--amber)' : 'rgba(255,255,255,0.15)', color: isIn ? 'var(--ink)' : 'transparent' }}>✓</span>
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

          {error && <div className="rounded p-3 text-sm" style={{ background: '#7f1d1d', color: '#fca5a5' }}>{error}</div>}

          <button onClick={startScoring} disabled={activePlayers.length < 2}
            className="w-full py-3.5 rounded-lg font-display text-2xl tracking-widest disabled:opacity-40 transition-opacity hover:opacity-90"
            style={{ background: 'var(--rust)', color: 'var(--cream)' }}>
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
          <button onClick={() => { clearPersistedState(); setStep(STEP.SETUP) }}
            className="text-xs tracking-widest" style={{ color: 'var(--cream-dark)' }}>
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
            const allDone = activePlayers.every(p => dnfPlayers[p.id] || (holeScores[p.id]?.[holeIdx] ?? null) !== null)
            const isActive = activeHole === h
            return (
              <button key={h} onClick={() => setActiveHole(h)}
                className="flex-shrink-0 w-9 h-9 rounded font-display text-lg tracking-wide transition-all"
                style={{
                  background: isActive ? 'var(--rust)' : allDone ? 'var(--teal)' : 'rgba(255,255,255,0.08)',
                  color: isActive ? 'var(--cream)' : allDone ? '#4ade80' : 'var(--cream-dark)',
                  border: isActive ? '2px solid var(--amber)' : '2px solid transparent',
                }}>
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
              <div key={p.id} className="rounded-xl overflow-hidden" style={{
                background: dnfPlayers[p.id] ? 'rgba(127,29,29,0.15)' : score !== null ? 'var(--scorecard)' : 'rgba(255,255,255,0.05)',
                border: `2px solid ${dnfPlayers[p.id] ? '#7f1d1d' : score !== null ? 'var(--teal)' : 'rgba(255,255,255,0.1)'}`,
              }}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="font-semibold tracking-wide text-base"
                      style={{ color: dnfPlayers[p.id] ? '#fca5a5' : score !== null ? 'var(--ink)' : 'var(--cream)' }}>
                      {p.name}
                    </span>
                    <span className="text-xs font-mono ml-2" style={{ color: hcp < 0 ? '#16a34a' : '#888' }}>
                      hcp {hcp === 0 ? 'scratch' : hcp}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!dnfPlayers[p.id] && (<>
                      <button onClick={() => adjustScore(p.id, holeIdx, -1)}
                        className="w-10 h-10 rounded-full font-display text-2xl flex items-center justify-center"
                        style={{ background: 'var(--rust)', color: 'var(--cream)' }}>−</button>
                      <span className="font-display text-3xl w-8 text-center"
                        style={{ color: score !== null ? 'var(--ink)' : 'var(--cream-dark)' }}>
                        {score ?? '—'}
                      </span>
                      <button onClick={() => adjustScore(p.id, holeIdx, +1)}
                        className="w-10 h-10 rounded-full font-display text-2xl flex items-center justify-center"
                        style={{ background: 'var(--teal)', color: 'var(--cream)' }}>+</button>
                    </>)}
                    {dnfPlayers[p.id] && (
                      <span className="font-display text-lg tracking-wide px-3 py-1 rounded"
                        style={{ background: '#7f1d1d', color: '#fca5a5' }}>DNF</span>
                    )}
                    <button onClick={() => toggleDnf(p.id)}
                      className="ml-1 px-2 py-1 rounded text-xs font-semibold"
                      style={{ background: dnfPlayers[p.id] ? 'var(--teal)' : 'rgba(127,29,29,0.4)', color: dnfPlayers[p.id] ? 'var(--cream)' : '#fca5a5' }}>
                      {dnfPlayers[p.id] ? 'undo' : 'DNF'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Hole nav */}
        <div className="flex gap-3 mt-4">
          {activeHole > 1 && (
            <button onClick={() => setActiveHole(h => h - 1)}
              className="flex-1 py-2.5 rounded-lg font-display tracking-widest text-base"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream-dark)' }}>
              ← HOLE {activeHole - 1}
            </button>
          )}
          {activeHole < 9 && (
            <button onClick={() => setActiveHole(h => h + 1)}
              className="flex-1 py-2.5 rounded-lg font-display tracking-widest text-base"
              style={{ background: 'var(--teal)', color: 'var(--cream)' }}>
              HOLE {activeHole + 1} →
            </button>
          )}
        </div>

        {/* Add Late Player */}
        <div className="mt-4">
          <button onClick={() => setLatePlayerOpen(o => !o)}
            className="w-full py-2 rounded-lg text-sm font-semibold tracking-wide"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--cream-dark)' }}>
            {latePlayerOpen ? '✕ Cancel' : '+ Add Late Player'}
          </button>

          {latePlayerOpen && (
            <div className="mt-2 rounded-xl p-4 space-y-3"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>

              {players.filter(p => !participating[p.id]).length > 0 && (
                <div>
                  <label className="block text-xs tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--cream-dark)' }}>
                    EXISTING PLAYER
                  </label>
                  <div className="flex gap-2">
                    <select value={latePlayerSelect}
                      onChange={e => { setLatePlayerSelect(e.target.value); setLatePlayerName('') }}
                      className="flex-1 rounded px-3 py-2 text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }}>
                      <option value="">Select player...</option>
                      {players.filter(p => !participating[p.id]).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button onClick={handleAddLatePlayer} disabled={!latePlayerSelect || addingLate}
                      className="px-4 py-2 rounded text-sm font-semibold disabled:opacity-40"
                      style={{ background: 'var(--teal)', color: 'var(--cream)' }}>
                      {addingLate ? '...' : 'Add'}
                    </button>
                  </div>
                </div>
              )}

              {players.filter(p => !participating[p.id]).length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
                  <span className="text-xs" style={{ color: 'var(--cream-dark)' }}>or</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
                </div>
              )}

              <div>
                <label className="block text-xs tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--cream-dark)' }}>
                  NEW PLAYER
                </label>
                <div className="flex gap-2">
                  <input type="text" placeholder="Player name" value={latePlayerName}
                    onChange={e => { setLatePlayerName(e.target.value); setLatePlayerSelect('') }}
                    onKeyDown={e => e.key === 'Enter' && handleAddLatePlayer()}
                    className="flex-1 rounded px-3 py-2 text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }} />
                  <button onClick={handleAddLatePlayer} disabled={!latePlayerName.trim() || addingLate}
                    className="px-4 py-2 rounded text-sm font-semibold disabled:opacity-40"
                    style={{ background: 'var(--teal)', color: 'var(--cream)' }}>
                    {addingLate ? '...' : 'Add'}
                  </button>
                </div>
              </div>

              {activeHole > 1 && (
                <p className="text-xs" style={{ color: 'var(--amber)' }}>
                  ⚠ Holes 1–{activeHole - 1} will be auto-scored as 5 (DNF penalty)
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Scorecard — sorted by current adjusted score */}
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
                    <th className="text-left px-3 py-2 font-semibold tracking-wide sticky left-0"
                      style={{ background: 'var(--teal)', minWidth: 80 }}>PLAYER</th>
                    {HOLES.map(h => (
                      <th key={h} className="px-2 py-2 text-center font-display text-sm cursor-pointer"
                        style={{ color: activeHole === h ? 'var(--amber)' : 'var(--cream)', minWidth: 32 }}
                        onClick={() => setActiveHole(h)}>{h}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-display text-sm" style={{ minWidth: 40 }}>RAW</th>
                    <th className="px-3 py-2 text-right font-display text-sm" style={{ minWidth: 40 }}>ADJ</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedActivePlayers.map((p, i) => {
                    const adj = playerCurrentAdjusted(p.id)
                    const raw = playerRawTotal(p.id)
                    return (
                      <tr key={p.id} style={{
                        borderTop: '1px solid var(--cream-dark)',
                        background: dnfPlayers[p.id] ? 'rgba(127,29,29,0.08)' : i === 0 && adj !== null ? 'rgba(212,168,50,0.12)' : i % 2 === 0 ? 'var(--parchment)' : 'var(--cream)',
                      }}>
                        <td className="px-3 py-2 font-semibold sticky left-0" style={{
                          background: dnfPlayers[p.id] ? 'rgba(127,29,29,0.08)' : i === 0 && adj !== null ? 'rgba(212,168,50,0.12)' : i % 2 === 0 ? 'var(--parchment)' : 'var(--cream)',
                          color: dnfPlayers[p.id] ? '#fca5a5' : 'var(--ink)', minWidth: 80,
                        }}>
                          {i === 0 && adj !== null && !dnfPlayers[p.id] ? '🏆 ' : ''}{p.name}
                        </td>
                        {HOLES.map((h, hi) => {
                          const s = playerHoleScore(p.id, hi)
                          const isCur = activeHole === h
                          return (
                            <td key={h} className="px-1 py-2 text-center font-mono cursor-pointer"
                              style={{
                                color: dnfPlayers[p.id] ? '#fca5a5' : s !== null ? 'var(--ink)' : 'var(--cream-dark)',
                                background: isCur ? 'rgba(201,75,26,0.12)' : 'transparent',
                                fontWeight: isCur ? 700 : 400, minWidth: 32,
                              }}
                              onClick={() => setActiveHole(h)}>
                              {dnfPlayers[p.id] && s === null ? '5' : (s ?? '·')}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-right font-mono text-xs"
                          style={{ color: 'var(--ink-light)' }}>
                          {dnfPlayers[p.id] ? '—' : raw > 0 ? raw : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold"
                          style={{ color: dnfPlayers[p.id] ? '#fca5a5' : adj !== null ? 'var(--teal)' : 'var(--cream-dark)' }}>
                          {dnfPlayers[p.id] ? 'DNF' : adj !== null ? adj : '—'}
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

      {/* Finish Round */}
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
        <button onClick={handleSubmit} disabled={!allNineComplete() || submitting}
          className="w-full py-4 rounded-xl font-display text-2xl tracking-widest disabled:opacity-30 transition-opacity"
          style={{ background: allNineComplete() ? 'var(--rust)' : 'rgba(255,255,255,0.1)', color: 'var(--cream)' }}>
          {submitting ? 'SAVING...' : '🏁 FINISH ROUND'}
        </button>
      </div>
    </div>
  )
}