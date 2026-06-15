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

export async function submitRound({ weekNumber, date, playerScores }) {
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
    points:         s.points ?? pointsForPlacement(s.placement, s.dnf),
    hole_scores:    s.hole_scores || null,
    dnf:            s.dnf || false,
  }))

  const { error: scoresError } = await supabase.from('scores').insert(scoreRows)
  if (scoresError) throw scoresError

  // Clean up any in-progress save for this week
  await clearInProgressRound()

  return round
}

// ── In-progress round (live hole saving) ──────────────────────────

const IN_PROGRESS_KEY = 'current'

export async function saveInProgressRound(state) {
  // state: { weekNumber, date, participating, holeScores, dnfPlayers, activeHole, playerIds }
  const { error } = await supabase
    .from('rounds_in_progress')
    .upsert({ id: IN_PROGRESS_KEY, state }, { onConflict: 'id' })
  if (error) console.warn('Could not save in-progress round:', error.message)
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