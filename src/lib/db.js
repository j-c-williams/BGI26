import { supabase } from '../supabase'
import { rankRound, fillDnfHoles, DNF_STROKES_PER_HOLE, TOTAL_HOLES, pointsForPlacement } from './scoring'

export async function getPlayers() {
  const { data, error } = await supabase
    .from('players').select('*').order('name')
  if (error) throw error
  return data
}

export async function addPlayer(name) {
  const { data: player, error } = await supabase
    .from('players').insert({ name: name.trim() }).select().single()
  if (error) throw error
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

export async function submitRound({ weekNumber, date, playerScores, tiebreakers = {} }) {
  const { data: round, error: roundError } = await supabase
    .from('rounds').insert({ week_number: weekNumber, date }).select().single()
  if (roundError) throw roundError

  const ranked = rankRound(playerScores, tiebreakers)

  const scoreRows = ranked.map(s => ({
    round_id:       round.id,
    player_id:      s.player_id,
    raw_score:      s.raw_score,
    handicap:       s.handicap,
    adjusted_score: s.adjusted_score,
    placement:      s.placement,
    hole_scores:    s.hole_scores || null,
    dnf:            s.dnf || false,
    points:         s.points || 0,
  }))

  const { error: scoresError } = await supabase.from('scores').insert(scoreRows)
  if (scoresError) throw scoresError

  return round
}

/**
 * Edit an existing round's scores.
 * Re-ranks everything and updates all rows in the DB.
 */
export async function editRound(roundId, playerScores, tiebreakers = {}) {
  const ranked = rankRound(playerScores, tiebreakers)

  for (const s of ranked) {
    const { error } = await supabase
      .from('scores')
      .update({
        raw_score:      s.raw_score,
        handicap:       s.handicap,
        adjusted_score: s.adjusted_score,
        placement:      s.placement,
        hole_scores:    s.hole_scores || null,
        dnf:            s.dnf || false,
        points:         s.points || 0,
      })
      .eq('round_id', roundId)
      .eq('player_id', s.player_id)
    if (error) throw error
  }
}

// ── In-progress round (cross-device saving) ────────────────────

const IN_PROGRESS_KEY = 'bgi_current_round'

export async function saveInProgressRound(state) {
  const { error } = await supabase
    .from('rounds_in_progress')
    .upsert({ id: IN_PROGRESS_KEY, state, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function loadInProgressRound() {
  const { data, error } = await supabase
    .from('rounds_in_progress')
    .select('state')
    .eq('id', IN_PROGRESS_KEY)
    .single()
  if (error) return null
  return data?.state ?? null
}

export async function clearInProgressRound() {
  await supabase
    .from('rounds_in_progress')
    .delete()
    .eq('id', IN_PROGRESS_KEY)
}