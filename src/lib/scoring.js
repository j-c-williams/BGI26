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
 * ║    DNF players are ranked after all finishers.              ║
 * ║                                                              ║
 * ║  SEASON-END DROP RULE:                                      ║
 * ║    Every player may drop their 2 worst rounds at the end    ║
 * ║    of the season. DNF rounds are a natural drop candidate.  ║
 * ║                                                              ║
 * ║  STANDINGS:                                                  ║
 * ║    Cumulative adjusted score across all rounds, lowest wins. ║
 * ║                                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

export const MISSED_WEEK_HANDICAP  = -3   // new players / no-show
export const DNF_STROKES_PER_HOLE  = 5    // penalty per unplayed hole on a DNF
export const TOTAL_HOLES           = 9

/**
 * Fill in unplayed holes for a DNF player.
 * hole_scores is an array of up to 9 values; missing/zero entries get DNF_STROKES_PER_HOLE.
 * Returns { filledHoles, rawScore }
 */
export function fillDnfHoles(holeScores = []) {
  const filled = Array.from({ length: TOTAL_HOLES }, (_, i) => {
    const s = holeScores[i]
    return (s && s > 0) ? s : DNF_STROKES_PER_HOLE
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
  return rawScore + handicap // handicap is negative, so this reduces the score
}

/**
 * Rank a round.
 * - Finishers ranked by adjusted score (raw + handicap).
 * - DNF players: holes filled at +5 each, NO handicap applied, ranked after finishers.
 */
export function rankRound(scores) {
  const finishers = scores.filter(s => !s.dnf)
  const dnfs      = scores.filter(s => s.dnf)

  const ranked = finishers.map(s => ({
    ...s,
    adjusted_score: calcAdjustedScore(s.raw_score, s.handicap),
  }))
  ranked.sort((a, b) => a.adjusted_score - b.adjusted_score)
  const result = ranked.map((s, i) => ({ ...s, placement: i + 1 }))

  // DNFs: fill holes, no handicap, placed after all finishers
  dnfs.forEach((s, i) => {
    const { filledHoles, rawScore } = fillDnfHoles(s.hole_scores)
    result.push({
      ...s,
      hole_scores:    filledHoles,
      raw_score:      rawScore,
      handicap:       0,          // no handicap benefit on a DNF
      adjusted_score: rawScore,   // adjusted = raw (no discount)
      placement:      ranked.length + i + 1,
      dnf:            true,
    })
  })

  return result
}

/**
 * Compute overall leaderboard standings across all rounds.
 * - Players who missed a round get DNF_STROKES_PER_HOLE * TOTAL_HOLES added automatically.
 * - Lower cumulative adjusted score = better.
 *
 * allScores: flat array of score rows (each has round_id via rounds.id join)
 * players:   all player rows
 * allRounds: all round rows (to detect missed weeks)
 */
export function computeStandings(allScores, players, allRounds = []) {
  const dnfPenalty = DNF_STROKES_PER_HOLE * TOTAL_HOLES  // 45

  // Build a set of which players appeared in each round
  const roundParticipants = {}  // roundId → Set of player_ids
  allScores.forEach(s => {
    const rid = s.round_id ?? s.rounds?.id
    if (!rid) return
    if (!roundParticipants[rid]) roundParticipants[rid] = new Set()
    roundParticipants[rid].add(s.player_id)
  })

  const totals = {}
  players.forEach(p => {
    totals[p.id] = { player: p, totalAdjusted: 0, totalRaw: 0, roundsPlayed: 0, wins: 0, dnfRounds: 0 }
  })

  // Count actual scores
  allScores.forEach(s => {
    if (!totals[s.player_id]) return
    totals[s.player_id].totalAdjusted += s.adjusted_score
    totals[s.player_id].totalRaw      += s.raw_score
    totals[s.player_id].roundsPlayed  += 1
    if (s.placement === 1) totals[s.player_id].wins += 1
    if (s.dnf)             totals[s.player_id].dnfRounds += 1
  })

  // Auto-add missed-week penalty for every round a player didn't participate in.
  // No "joined date" cutoff — if you weren't there, you get the DNF penalty.
  allRounds.forEach(r => {
    const participants = roundParticipants[r.id] || new Set()
    players.forEach(p => {
      if (participants.has(p.id)) return  // they played, no penalty needed
      if (!totals[p.id]) return
      totals[p.id].totalAdjusted += dnfPenalty
      totals[p.id].totalRaw      += dnfPenalty
      totals[p.id].roundsPlayed  += 1
      totals[p.id].dnfRounds     += 1
    })
  })

  return Object.values(totals)
    .filter(t => t.roundsPlayed > 0)
    .sort((a, b) => a.totalAdjusted - b.totalAdjusted)
    .map((t, i) => ({ ...t, standing: i + 1 }))
}
