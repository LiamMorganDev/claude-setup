// Pure win bookkeeping. No `$` here, so tests run it directly.
import type { Win } from '../types'

const DAY = 24 * 3600_000
const KEEP_DAYS = 60

// Local calendar day, so "today" flips at the person's midnight.
export const dayOf = (t: number, offsetMin: number) => Math.floor((t - offsetMin * 60_000) / DAY)

export const addWin = (wins: readonly Win[], w: Win, offsetMin: number) =>
  [...wins.filter(x => dayOf(w.t, offsetMin) - dayOf(x.t, offsetMin) < KEEP_DAYS), w]

export function summary(wins: readonly Win[], now: number, offsetMin: number) {
  const today = dayOf(now, offsetMin)
  const days = new Set(wins.map(w => dayOf(w.t, offsetMin)))
  let streak = 0
  // A streak still counts today before the first win of the day lands.
  for (let d = days.has(today) ? today : today - 1; days.has(d); d--) streak++
  const todays = wins.filter(w => dayOf(w.t, offsetMin) === today)
  const byProject: Record<string, Win[]> = {}
  for (const w of todays) (byProject[w.project] ??= []).push(w)
  return {
    today: todays.length,
    week: wins.filter(w => today - dayOf(w.t, offsetMin) < 7).length,
    streak,
    byProject,
  }
}
