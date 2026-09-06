/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              BGI SCORING RULES — SUMMER 2026                ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  HANDICAPS (earned last week, applied this week):           ║
 * ║    1st place      →  0  (scratch, no advantage)             ║
 * ║    2nd place      → -1                                      ║
 * ║    3rd place      → -2                                      ║
 * ║    Everyone else  → -3                                      ║
 * ║    Dead last      → -4                                      ║
 * ║    New / no-show  → -3  (same as "everyone else")           ║
 * ║                                                              ║
 * ║  DNF / MISSED HOLES:                                        ║
 * ║    Any hole not completed scores +5 strokes.                ║
 * ║    No handicap discount is applied to a DNF round.          ║
 * ║    DNF players are ranked after all finishers.              ║
 * ║                                                              ║
 * ║  TIEBREAKER:                                                ║
 * ║    If 2+ players tie for 1st after 9 holes, a closest-to-  ║
 * ║    pin tiebreaker is held. Winner takes 1st, loser takes    ║
 * ║    next place. Tiebreaker strokes do NOT count toward total.║
 * ║                                                              ║
 * ║  POINTS (per round, based on adjusted placement):           ║
 * ║    1st → 10, 2nd → 7, 3rd → 5, 4th → 3, 5th → 1, else → 0 ║
 * ║    Ties share the full points for that place (both 1st      ║
 * ║    both get 10). Uses dense ranking (1,1,3 not 1,1,2).     ║
 * ║                                                              ║
 * ║  SEASON-END DROP RULE:                                      ║
 * ║    Every player may drop their 2 worst rounds at the end.   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

export const MISSED_WEEK_HANDICAP  = -3
export const DNF_STROKES_PER_HOLE  = 5
export const TOTAL_HOLES           = 9

// Points awarded per placement (1-indexed, 0 for 6th+)
export const PLACEMENT_POINTS = { 1: 10, 2: 7, 3: 5, 4: 3, 5: 1 }

export function pointsForPlacement(placement, dnf = false) {
  if (dnf) return 0
  return PLACEMENT_POINTS[placement] ?? 0
}

export function fillDnfHoles(holeScores = []) {
  const filled = Array.from({ length: TOTAL_HOLES }, (_, i) => {
    const s = holeScores[i]
    return (s !== null && s !== undefined && s > 0) ? s : DNF_STROKES_PER_HOLE
  })
  return {
    filledHoles: filled,
    rawScore: filled.reduce((a, b) => a + b, 0),
  }
}

export function getHandicapForPlacement(placement, totalPlayers) {
  if (placement === null || placement === undefined) return MISSED_WEEK_HANDICAP
  if (placement === 1) return 0
  if (placement === 2) return -1
  if (placement === 3) return -2
  if (placement === totalPlayers) return -4
  return -3
}

export function calcAdjustedScore(rawScore, handicap) {
  return rawScore + handicap
}

/**
 * Rank a round with dense tie handling (1, 1, 3 not 1, 1, 2).
 * Finishers ranked by adjusted score; DNFs ranked after, no handicap.
 * Accepts optional tiebreaker map: { playerId → distance (lower wins) }
 * If provided, tied-for-1st players are broken by tiebreaker distance.
 */
export function rankRound(scores, tiebreakers = {}) {
  const finishers = scores.filter(s => !s.dnf)
  const dnfs      = scores.filter(s => s.dnf)

  // Sort finishers by adjusted score, then by tiebreaker distance if tied for 1st
  const withAdj = finishers.map(s => ({
    ...s,
    adjusted_score: calcAdjustedScore(s.raw_score, s.handicap),
  }))
  withAdj.sort((a, b) => {
    if (a.adjusted_score !== b.adjusted_score) return a.adjusted_score - b.adjusted_score
    // Tied — check tiebreaker
    const ta = tiebreakers[a.player_id]
    const tb = tiebreakers[b.player_id]
    if (ta !== undefined && tb !== undefined) return ta - tb
    return 0
  })

  // Dense ranking
  let place = 1
  const result = withAdj.map((s, i) => {
    if (i > 0 && s.adjusted_score > withAdj[i - 1].adjusted_score) place = i + 1
    // Tiebreaker breaks ties for 1st only — check if this player won the tiebreaker
    if (i > 0 && s.adjusted_score === withAdj[i - 1].adjusted_score) {
      const ta = tiebreakers[s.player_id]
      const prev = tiebreakers[withAdj[i - 1].player_id]
      if (ta !== undefined && prev !== undefined && ta !== prev) {
        // These two were broken by tiebreaker — increment place
        place = i + 1
      }
    }
    return { ...s, placement: place, points: pointsForPlacement(place) }
  })

  // DNFs placed after all finishers, no handicap
  dnfs.forEach((s, i) => {
    const { filledHoles, rawScore } = fillDnfHoles(s.hole_scores)
    result.push({
      ...s,
      hole_scores:    filledHoles,
      raw_score:      rawScore,
      handicap:       0,
      adjusted_score: rawScore,
      placement:      result.length + i + 1,
      dnf:            true,
      points:         0,
    })
  })

  return result
}

/**
 * Compute overall leaderboard standings across all rounds.
 * Players who missed a round get DNF_STROKES_PER_HOLE * TOTAL_HOLES penalty.
 * Sorted by total points descending (points system), adj strokes as tiebreaker.
 */
export function computeStandings(allScores, players, allRounds = []) {
  const dnfPenalty = DNF_STROKES_PER_HOLE * TOTAL_HOLES // 45

  const roundParticipants = {}
  allScores.forEach(s => {
    const rid = s.round_id ?? s.rounds?.id
    if (!rid) return
    if (!roundParticipants[rid]) roundParticipants[rid] = new Set()
    roundParticipants[rid].add(s.player_id)
  })

  const totals = {}
  players.forEach(p => {
    totals[p.id] = {
      player: p,
      totalPoints:   0,
      totalAdjusted: 0,
      totalRaw:      0,
      roundsPlayed:  0,
      wins:          0,
      dnfRounds:     0,
    }
  })

  allScores.forEach(s => {
    if (!totals[s.player_id]) return
    totals[s.player_id].totalAdjusted += s.adjusted_score
    totals[s.player_id].totalRaw      += s.raw_score
    totals[s.player_id].roundsPlayed  += 1
    totals[s.player_id].totalPoints   += (s.points ?? pointsForPlacement(s.placement, s.dnf))
    if (s.placement === 1 && !s.dnf) totals[s.player_id].wins += 1
    if (s.dnf)                       totals[s.player_id].dnfRounds += 1
  })

  // Auto-add missed-week penalty for every round a player didn't participate in
  allRounds.forEach(r => {
    const participants = roundParticipants[r.id] || new Set()
    players.forEach(p => {
      if (participants.has(p.id)) return
      if (!totals[p.id]) return
      totals[p.id].totalAdjusted += dnfPenalty
      totals[p.id].totalRaw      += dnfPenalty
      totals[p.id].roundsPlayed  += 1
      totals[p.id].dnfRounds     += 1
      // 0 points for missed round
    })
  })

  return Object.values(totals)
    .filter(t => t.roundsPlayed > 0)
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
      return a.totalAdjusted - b.totalAdjusted // tiebreaker: fewer strokes
    })
    .map((t, i) => ({ ...t, standing: i + 1 }))
}