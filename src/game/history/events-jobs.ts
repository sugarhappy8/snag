// Jobs of the first three quarters of the twentieth century that the modern job board never had:
// domestic service, telegram messengers, mill hands, miners, tram and bus conductors, stenographers,
// cinema ushers, munitions workers in the world wars, caddies and delivery boys. careers.ts adds them to the
// listings in their years and resolves them by id (data/jobs.ts does not know them). Salaries are
// yearly constant-dollar pay for the starting rung (same scale as the rest of the board, before
// careers.ts applies the country's wealth and the era's pay shape); pay is in real proportion to
// its neighbors: a miner or a steelworker out-earned a clerk, a messenger boy or a kitchen maid
// earned a fraction of either. Pure data, no RNG.
import type { JobDef, JobRung } from '../data/jobs'

function rungs(list: readonly (readonly [string, number])[]): JobRung[] {
  return list.map(([title, k]) => ({ title, salary: Math.round(k * 1000) }))
}

function full(id: string, emoji: string, industry: JobDef['industry'], edu: JobDef['edu'], list: readonly (readonly [string, number])[], extra: Partial<JobDef> = {}): JobDef {
  return { id, emoji, category: 'fulltime', industry, edu, ladder: rungs(list), ...extra }
}

function part(id: string, emoji: string, title: string, industry: JobDef['industry'], hourly: number, hours: number, extra: Partial<JobDef> = {}): JobDef {
  return { id, emoji, category: 'parttime', industry, edu: 'none', hourly, hours, ladder: [{ title, salary: Math.round(hourly * hours * 52) }], ...extra }
}

export const EARLY_FULLTIME_JOBS: JobDef[] = [
  full('domestic_servant', '\u{1F9F9}', 'hotel', 'none', [['Kitchen Maid', 14], ['Housemaid', 17], ['Head Housekeeper', 26]], { minAge: 14, until: 1965 }),
  full('telegram_messenger', '\u{1F6B2}', 'municipal', 'none', [['Telegram Messenger', 11]], { minAge: 14, until: 1970 }),
  full('errand_boy', '\u{1F4E6}', 'smallbiz', 'none', [['Errand Boy', 12], ['Shop Assistant', 19]], { minAge: 14, until: 1960 }),
  full('mill_hand', '\u{1F9F6}', 'factory', 'none', [['Mill Hand', 20], ['Loom Overlooker', 28]], { until: 1965, danger: 0.04 }),
  full('coal_miner', '\u{26CF}\u{FE0F}', 'factory', 'none', [['Pit Lad', 24], ['Collier', 36], ['Deputy', 44]], { until: 1995, danger: 0.06, stress: 2, gender: 'male', minAthleticism: 35 }),
  full('steelworker', '\u{1F525}', 'factory', 'none', [['Mill Laborer', 30], ['Roller', 48]], { until: 1990, danger: 0.05, minAthleticism: 35 }),
  full('railway_porter', '\u{1F686}', 'municipal', 'none', [['Station Porter', 21], ['Guard', 30]], { until: 1975 }),
  full('tram_conductor', '\u{1F68B}', 'municipal', 'none', [['Tram Conductor', 24], ['Motorman', 32]], { until: 1960 }),
  full('bus_conductor', '\u{1F68C}', 'municipal', 'none', [['Bus Conductor', 25]], { from: 1920, until: 1985, minAge: 17 }),
  full('draper_apprentice', '\u{1F9F5}', 'retail', 'none', [['Draper’s Apprentice', 17], ['Draper', 28]], { until: 1965, minAge: 14 }),
  full('cobbler', '\u{1F45E}', 'smallbiz', 'none', [['Cobbler’s Apprentice', 18], ['Cobbler', 28]], { until: 1980 }),
  full('wheelwright', '\u{2699}\u{FE0F}', 'smallbiz', 'none', [['Wheelwright’s Apprentice', 19], ['Wheelwright', 33]], { until: 1945 }),
  full('stenographer', '\u{1F4DD}', 'corporate', 'highschool', [['Stenographer', 23], ['Court Reporter', 35]], { until: 1985 }),
  full('cinema_usher', '\u{1F39F}\u{FE0F}', 'film', 'none', [['Cinema Usher', 15]], { from: 1910, until: 1980, minAge: 16 }),
  full('ticket_collector', '\u{1F3AB}', 'municipal', 'none', [['Ticket Collector', 22]], { until: 1980 }),
  full('munitions_worker', '\u{1F4A3}', 'factory', 'none', [['Munitions Worker', 31]], { from: 1914, until: 1918, danger: 0.05 }),
  full('war_plant_worker', '\u{1F6E0}\u{FE0F}', 'factory', 'none', [['War Plant Worker', 32], ['Line Supervisor', 42]], { from: 1939, until: 1945, danger: 0.04 }),
  full('lift_attendant', '\u{1F6D7}', 'retail', 'none', [['Lift Attendant', 16]], { until: 1965, minAge: 15 }),
  full('postal_clerk', '\u{1F4EE}', 'municipal', 'highschool', [['Postal Clerk', 27], ['Postmaster', 40]], { until: 1990 }),
]

export const EARLY_PARTTIME_JOBS: JobDef[] = [
  part('pt_delivery_boy', '\u{1F6B2}', 'Delivery Boy', 'grocery', 6, 14, { minAge: 12, until: 1970 }),
  part('pt_golf_caddie', '\u{26F3}', 'Golf Caddie', 'smallbiz', 7, 14, { minAge: 11, until: 1975 }),
  part('pt_farm_chores', '\u{1F69C}', 'Farm Hand (Summers)', 'farm', 7, 20, { minAge: 11, until: 1975 }),
  part('pt_bobby_pin', '\u{1F3B3}', 'Bowling Alley Setter', 'smallbiz', 8, 18, { minAge: 12, from: 1930, until: 1960 }),
  part('pt_cinema_ice', '\u{1F366}', 'Cinema Ice-Cream Seller', 'film', 7, 12, { minAge: 13, from: 1920, until: 1985 }),
]

const BY_ID: ReadonlyMap<string, JobDef> = new Map([...EARLY_FULLTIME_JOBS, ...EARLY_PARTTIME_JOBS].map((d) => [d.id, d]))

/** One of the jobs above by id (data/jobs.ts getJobDef does not know them). */
export function earlyJobDef(id: string): JobDef | undefined {
  return BY_ID.get(id)
}
