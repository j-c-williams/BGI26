/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              BGI SCORING RULES — SUMMER 2026                ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                                                              ║
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
 * ║    No handicap discount is applied to a DNF round —         ║
 * ║    you have to actually finish to benefit from your hcp.    ║
 * ║    DNF players are ranked after all finishers, get 0 pts.  ║
 * ║                                                              ║
 * ║  POINTS (per round, based on adjusted placement):           ║
 * ║    1st  → 10 pts   2nd → 7 pts   3rd → 5 pts               ║
 * ║    4th  →  3 pts   5th → 1 pt    6th+ / DNF → 0 pts        ║
 * ║    Ties share the full points for that place (both 1st      ║
 * ║    both get 10). Uses dense ranking (1,1,3 not 1,1,2).     ║
 * ║                                                              ║
 * ║  SEASON-END DROP RULE:                                      ║
 * ║    Every player may drop their 2 worst rounds at the end    ║
 * ║    of the season. DNF rounds are a natural drop candidate.  ║
 * ║                                                              ║
 * ║  OVERALL STANDINGS:                                         ║
 * ║    Ranked by cumulative points, highest wins.               ║
 * ║    Tiebreaker: lower cumulative adjusted strokes.           ║
 * ║                                                              ║
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

/**
 * Fill in unplayed holes for a DNF player.
 * Preserves any holes already scored (> 0), fills the rest with DNF_STROKES_PER_HOLE.
 */
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
 * - Finishers ranked by adjusted score ascending.
 * - DNF players placed after all finishers, get 0 points.
 * - Tied players share the same placement and same points.
 */
export function rankRound(scores) {
  const finishers = scores.filter(s => !s.dnf)
  const dnfs      = scores.filter(s => s.dnf)

  // Compute adjusted scores and sort
  const ranked = finishers
    .map(s => ({ ...s, adjusted_score: calcAdjustedScore(s.raw_score, s.handicap) }))
    .sort((a, b) => a.adjusted_score - b.adjusted_score)

  // Dense ranking: ties share the same place, next place skips
  let place = 1
  const result = ranked.map((s, i) => {
    if (i > 0 && s.adjusted_score > ranked[i - 1].adjusted_score) {
      place = i + 1  // jump to actual position, not just +1
    }
    return { ...s, placement: place, points: pointsForPlacement(place) }
  })

  // DNFs: fill holes, no handicap, placed after finishers, 0 points
  dnfs.forEach((s, i) => {
    const { filledHoles, rawScore } = fillDnfHoles(s.hole_scores)
    result.push({
      ...s,
      hole_scores:    filledHoles,
      raw_score:      rawScore,
      handicap:       0,
      adjusted_score: rawScore,
      placement:      ranked.length + i + 1,
      points:         0,
      dnf:            true,
    })
  })

  return result
}

/**
 * Compute overall standings using the points system.
 * - Higher points = better.
 * - Tiebreaker: lower cumulative adjusted strokes.
 * - Missed rounds = 0 points + DNF stroke penalty added to adjusted total.
 */
export function computeStandings(allScores, players, allRounds = []) {
  const dnfPenalty = DNF_STROKES_PER_HOLE * TOTAL_HOLES  // 45

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
    totals[s.player_id].totalPoints   += (s.points ?? pointsForPlacement(s.placement, s.dnf))
    totals[s.player_id].totalAdjusted += s.adjusted_score
    totals[s.player_id].totalRaw      += s.raw_score
    totals[s.player_id].roundsPlayed  += 1
    if (s.placement === 1 && !s.dnf) totals[s.player_id].wins += 1
    if (s.dnf)                        totals[s.player_id].dnfRounds += 1
  })

  // Missed rounds: 0 points, but stroke penalty still added to adjusted total
  allRounds.forEach(r => {
    const participants = roundParticipants[r.id] || new Set()
    players.forEach(p => {
      if (participants.has(p.id)) return
      if (!totals[p.id]) return
      // 0 points for missing — no update to totalPoints
      totals[p.id].totalAdjusted += dnfPenalty
      totals[p.id].totalRaw      += dnfPenalty
      totals[p.id].roundsPlayed  += 1
      totals[p.id].dnfRounds     += 1
    })
  })

  return Object.values(totals)
    .filter(t => t.roundsPlayed > 0)
    // Sort: most points first; tiebreak by fewest adjusted strokes
    .sort((a, b) => b.totalPoints - a.totalPoints || a.totalAdjusted - b.totalAdjusted)
    .map((t, i) => ({ ...t, standing: i + 1 }))
}