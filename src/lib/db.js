import { supabase } from '../supabase'
import { rankRound, fillDnfHoles, DNF_STROKES_PER_HOLE, TOTAL_HOLES } from './scoring'

export async function getPlayers() {
  const { data, error } = await supabase
    .from('players').select('*').order('name')
  if (error) throw error
  return data
}

/**
 * Add a new player and retroactively insert DNF rounds for every
 * round already played, so they don't start with 0 strokes.
 */
export async function addPlayer(name) {
  const { data: player, error } = await supabase
    .from('players').insert({ name: name.trim() }).select().single()
  if (error) throw error

  // Fetch all existing rounds
  const rounds = await getRounds()
  if (rounds.length > 0) {
    const dnfScore = DNF_STROKES_PER_HOLE * TOTAL_HOLES  // 45
    const dnfHoles = Array(TOTAL_HOLES).fill(DNF_STROKES_PER_HOLE)
    const retroRows = rounds.map((r, i) => ({
      round_id:       r.id,
      player_id:      player.id,
      raw_score:      dnfScore,
      handicap:       0,
      adjusted_score: dnfScore,
      // Place them last in each historical round (rounds.length - i = descending week order)
      placement:      999,   // will be overridden visually; just needs to be last-ish
      hole_scores:    dnfHoles,
      dnf:            true,
    }))
    // Insert quietly — don't throw if there's a conflict, just skip
    await supabase.from('scores').insert(retroRows)
  }

  return player
}

export async function getRounds() {
  const { data, error } = await supabase
    .from('rounds').select('*').order('week_number', { ascending: false })
  if (error) throw error
  return data
}

export async function getRoundWithScores(roundId) {
  const { data, error } = await supabase
    .from('scores')
    .select('*, players(id, name)')
    .eq('round_id', roundId)
    .order('placement')
  if (error) throw error
  return data
}

export async function getAllScores() {
  const { data, error } = await supabase
    .from('scores')
    .select('*, players(id, name), rounds(id, week_number, date)')
  if (error) throw error
  return data
}

export async function getLastRoundPlacements() {
  const rounds = await getRounds()
  if (!rounds.length) return {}
  const lastRound = rounds[0]
  const scores = await getRoundWithScores(lastRound.id)
  const placements = {}
  scores.forEach(s => { placements[s.player_id] = s.placement })
  return { placements, totalPlayers: scores.length, lastRound }
}

export async function submitRound({ weekNumber, date, playerScores }) {
  // playerScores: [{ player_id, raw_score, handicap, hole_scores, dnf? }]
  const { data: round, error: roundError } = await supabase
    .from('rounds').insert({ week_number: weekNumber, date }).select().single()
  if (roundError) throw roundError

  const ranked = rankRound(playerScores)

  const scoreRows = ranked.map(s => ({
    round_id:       round.id,
    player_id:      s.player_id,
    raw_score:      s.raw_score,
    handicap:       s.handicap,
    adjusted_score: s.adjusted_score,
    placement:      s.placement,
    hole_scores:    s.hole_scores || null,
    dnf:            s.dnf || false,
  }))

  const { error: scoresError } = await supabase.from('scores').insert(scoreRows)
  if (scoresError) throw scoresError

  return round
}
