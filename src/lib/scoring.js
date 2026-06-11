/**
 * Handicap rules:
 * 1st place last week  → 0 strokes off this week
 * 2nd place           → -1
 * 3rd place           → -2
 * Everyone else       → -3
 * Dead last / DNF     → -4
 *
 * New players / missed week: configurable, default = -3
 */

export const MISSED_WEEK_HANDICAP = -3

export function getHandicapForPlacement(placement, totalPlayers) {
  if (placement === null || placement === undefined) return MISSED_WEEK_HANDICAP
  if (placement === 1) return 0
  if (placement === 2) return -1
  if (placement === 3) return -2
  if (placement === totalPlayers) return -4
  return -3
}

export function calcAdjustedScore(rawScore, handicap) {
  return rawScore + handicap // handicap is negative, lowers the score
}

/**
 * Rank a round. DNF players sort after all finishers.
 * scores: [{ player_id, raw_score, handicap, dnf? }]
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

  // DNFs land after all finishers — they earn last-place handicap next week
  dnfs.forEach((s, i) => {
    result.push({
      ...s,
      adjusted_score: calcAdjustedScore(s.raw_score, s.handicap),
      placement: ranked.length + i + 1,
      dnf: true,
    })
  })

  return result
}

/**
 * Compute overall leaderboard standings across all rounds.
 * Lower cumulative adjusted score = better. DNF rounds still count raw strokes.
 */
export function computeStandings(allScores, players) {
  const totals = {}
  players.forEach(p => {
    totals[p.id] = { player: p, totalAdjusted: 0, totalRaw: 0, roundsPlayed: 0, wins: 0 }
  })

  allScores.forEach(s => {
    if (!totals[s.player_id]) return
    totals[s.player_id].totalAdjusted += s.adjusted_score
    totals[s.player_id].totalRaw      += s.raw_score
    totals[s.player_id].roundsPlayed  += 1
    if (s.placement === 1) totals[s.player_id].wins += 1
  })

  return Object.values(totals)
    .filter(t => t.roundsPlayed > 0)
    .sort((a, b) => a.totalAdjusted - b.totalAdjusted)
    .map((t, i) => ({ ...t, standing: i + 1 }))
}
