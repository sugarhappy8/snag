// Catalog of the individual sports (and the Olympic combat sports judo and wrestling) that run on
// the shared tour engine in sports-individual.ts: circuits, marquee events, prize money,
// attributes, where they can be played, and the copy for the decisive moment of an event.
// Every tour, event, team and brand name is original.

export type EventTier = 'minor' | 'tour' | 'major' | 'finals'

export interface IndEvent {
  id: string
  /** May contain {city} (a host city), {demonym} (your nationality) or {resort}. */
  name: string
  tier: EventTier
  /** Winner's prize (dollars). Others get a share by result. */
  prize: number
  /** Winner's ranking points (race format: race points for a win). */
  pts: number
  field: number
  /** Must be ranked at least this high to enter (majors allow qualifying down to twice that). */
  minRank?: number
  /** Only held for players on this circuit. */
  onlyTier?: number
  /** Only open from this circuit up. */
  minTier?: number
  years?: 'odd' | 'even'
  /** Only for these disciplines. */
  disc?: string[]
}

export interface IndTier {
  name: string
  /** Typical winning level of a regular event on this circuit (0-100 scale). */
  level: number
  /** Points-ranked sports: the ranking that earns a place on this circuit. */
  enterRank?: number
  /** Smaller events played automatically during the season. */
  auto: number
  autoName: string
  autoPrize: number
  autoPts: number
  autoField: number
  /** Team sports-within-individual-sports (cycling, motor racing): yearly salary range. */
  salary?: [number, number]
  /** Motor racing: what a seat costs per season unless a team pays for you. */
  seatCost?: number
  teams?: string[]
}

export interface Pivot {
  title: string
  attack: string
  steady: string
  mind: string
  /** What going wrong looks like when you attack and fail. */
  fail: string
}

export interface IndSport {
  id: string
  name: string
  emoji: string
  group: 'individual' | 'combat'
  /** Matches the local "popular sports" words. */
  locale: RegExp
  title: string
  format: 'bracket' | 'field' | 'race'
  attrs: string[]
  /** The attribute that powers the "mind games" choice. */
  mental: string
  disciplines?: string[]
  events: IndEvent[]
  tiers: IndTier[]
  peak: [number, number]
  retire: number
  proAge: number
  juniorAge: number
  /** Too old to start from scratch. */
  maxStartAge: number
  needs?: 'snow' | 'coast' | 'rink'
  olympic: 'summer' | 'winter' | null
  /** How much brands care (0-1). */
  appeal: number
  /** Yearly coaching/travel/equipment on the lower circuit (dollars). */
  costs: number
  /** Injury chance per event. */
  risk: number
  injuries: string[]
  /** Places that win prize money in field events. */
  paid: number
  /** Federation funding for ranked national-team athletes. */
  stipend: number
  /** Appearance fees for famous stars (yearly scale). */
  appearance: number
  /** How much raw athleticism matters (darts: not much). */
  athletic: number
  pivot: Pivot
  /** 'tournament', 'race', 'meet', 'contest'. */
  eventWord: string
  /** Head knocks per season (contact or crash-prone sports). */
  knocks?: number
}

const MAJOR_TOUR_LEVEL = 72

export const MOTOR_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]

export const IND_SPORTS: IndSport[] = [
  {
    id: 'tennis',
    name: 'Tennis',
    emoji: '\u{1F3BE}',
    group: 'individual',
    locale: /^tennis$/i,
    title: 'Pro Tennis Player',
    format: 'bracket',
    attrs: ['Serve', 'Forehand', 'Backhand', 'Footwork', 'Mental Toughness'],
    mental: 'Mental Toughness',
    events: [
      { id: 'cha', name: '{city} Challenger', tier: 'minor', prize: 22_000, pts: 100, field: 32, onlyTier: 0 },
      { id: 'chb', name: '{city} Challenger', tier: 'minor', prize: 30_000, pts: 125, field: 32, onlyTier: 0 },
      { id: 'sco', name: 'Southern Cross Open', tier: 'major', prize: 3_000_000, pts: 2000, field: 128, minRank: 125 },
      { id: 'tro', name: 'Terre Rouge Open', tier: 'major', prize: 2_700_000, pts: 2000, field: 128, minRank: 125 },
      { id: 'lawn', name: 'The Lawn Championships', tier: 'major', prize: 3_500_000, pts: 2000, field: 128, minRank: 125 },
      { id: 'eco', name: 'Empire City Open', tier: 'major', prize: 3_600_000, pts: 2000, field: 128, minRank: 125 },
      { id: 'dpm', name: 'Desert Palms Masters', tier: 'tour', prize: 1_100_000, pts: 1000, field: 96, minRank: 80 },
      { id: 'rvm', name: 'Riviera Masters', tier: 'tour', prize: 900_000, pts: 1000, field: 56, minRank: 60 },
      { id: 'fin', name: 'Tour Finals', tier: 'finals', prize: 4_500_000, pts: 1500, field: 8, minRank: 8 },
    ],
    tiers: [
      { name: 'Challenger Circuit', level: 58, auto: 14, autoName: 'Challenger events', autoPrize: 20_000, autoPts: 90, autoField: 32 },
      { name: 'Pro Tennis Tour', level: MAJOR_TOUR_LEVEL, enterRank: 100, auto: 12, autoName: 'tour events', autoPrize: 450_000, autoPts: 330, autoField: 32 },
    ],
    peak: [22, 30],
    retire: 37,
    proAge: 16,
    juniorAge: 5,
    maxStartAge: 26,
    olympic: 'summer',
    appeal: 0.95,
    costs: 60_000,
    risk: 0.04,
    injuries: ['Tennis Elbow', 'Sprained Ankle', 'Torn Abdominal Muscle', 'Wrist Tendinitis'],
    paid: 128,
    stipend: 0,
    appearance: 1_500_000,
    athletic: 0.15,
    pivot: { title: 'Championship Point', attack: 'Go for your shots', steady: 'Grind out long rallies', mind: 'Slow it down and get in their head', fail: 'You sprayed three forehands into the doubles alley.' },
    eventWord: 'tournament',
  },
  {
    id: 'golf',
    name: 'Golf',
    emoji: '\u{26F3}',
    group: 'individual',
    locale: /^golf$/i,
    title: 'Pro Golfer',
    format: 'field',
    attrs: ['Driving', 'Iron Play', 'Short Game', 'Putting', 'Composure'],
    mental: 'Composure',
    events: [
      { id: 'dev', name: 'The {city} Classic', tier: 'minor', prize: 150_000, pts: 90, field: 144, onlyTier: 0 },
      { id: 'mag', name: 'The Magnolia Invitational', tier: 'major', prize: 3_600_000, pts: 2000, field: 90, minRank: 50 },
      { id: 'pgc', name: "Pro Golfers' Championship", tier: 'major', prize: 3_300_000, pts: 2000, field: 156, minRank: 100 },
      { id: 'con', name: 'The Continental Open', tier: 'major', prize: 4_300_000, pts: 2000, field: 156, minRank: 120 },
      { id: 'olc', name: 'The Old Links Championship', tier: 'major', prize: 3_100_000, pts: 2000, field: 156, minRank: 120 },
      { id: 'isl', name: 'The Island Players Championship', tier: 'tour', prize: 4_500_000, pts: 1000, field: 144, minRank: 125, minTier: 1 },
      { id: 'fin', name: 'Season Cup Finale', tier: 'finals', prize: 10_000_000, pts: 1500, field: 30, minRank: 30, minTier: 1 },
    ],
    tiers: [
      { name: 'Development Tour', level: 58, auto: 16, autoName: 'Development Tour events', autoPrize: 140_000, autoPts: 80, autoField: 144 },
      { name: 'Fairway Pro Tour', level: MAJOR_TOUR_LEVEL, enterRank: 125, auto: 16, autoName: 'tour events', autoPrize: 1_500_000, autoPts: 320, autoField: 144 },
    ],
    peak: [27, 38],
    retire: 50,
    proAge: 17,
    juniorAge: 7,
    maxStartAge: 32,
    olympic: 'summer',
    appeal: 0.85,
    costs: 45_000,
    risk: 0.015,
    injuries: ['Bad Back', 'Golfer’s Elbow', 'Wrist Strain'],
    paid: 65,
    stipend: 0,
    appearance: 1_200_000,
    athletic: 0.05,
    pivot: { title: 'Sunday Back Nine', attack: 'Attack every pin', steady: 'Fairways and greens', mind: 'Ignore the leaderboard', fail: 'You found the water on 16. Then the water found you again.' },
    eventWord: 'tournament',
  },
  {
    id: 'track',
    name: 'Track & Field',
    emoji: '\u{1F3C3}',
    group: 'individual',
    locale: /athletics|^track|running/i,
    title: 'Pro Track Athlete',
    format: 'field',
    attrs: ['Speed', 'Endurance', 'Technique', 'Power'],
    mental: 'Technique',
    disciplines: ['100m', '400m', '1500m', 'Marathon', 'Long Jump', 'High Jump', 'Javelin', 'Decathlon'],
    events: [
      { id: 'nat', name: '{demonym} Athletics Championships', tier: 'minor', prize: 5_000, pts: 150, field: 24, onlyTier: 0 },
      { id: 'gs1', name: 'Golden Spike {city}', tier: 'tour', prize: 10_000, pts: 500, field: 24, minRank: 150, disc: ['100m', '400m', '1500m', 'Long Jump', 'High Jump', 'Javelin', 'Decathlon'] },
      { id: 'gs2', name: 'Golden Spike {city}', tier: 'tour', prize: 10_000, pts: 500, field: 24, minRank: 150, disc: ['100m', '400m', '1500m', 'Long Jump', 'High Jump', 'Javelin', 'Decathlon'] },
      { id: 'gsf', name: 'Golden Spike Final', tier: 'finals', prize: 30_000, pts: 1500, field: 12, minRank: 12, disc: ['100m', '400m', '1500m', 'Long Jump', 'High Jump', 'Javelin', 'Decathlon'] },
      { id: 'hbm', name: 'Harborview Marathon', tier: 'tour', prize: 150_000, pts: 1000, field: 40, minRank: 250, disc: ['Marathon'] },
      { id: 'ccm', name: 'Capital City Marathon', tier: 'tour', prize: 100_000, pts: 800, field: 40, minRank: 250, disc: ['Marathon'] },
      { id: 'wtc', name: 'World Track Championships', tier: 'major', prize: 70_000, pts: 2000, field: 40, minRank: 48, years: 'odd' },
    ],
    tiers: [
      { name: 'National Circuit', level: 58, auto: 5, autoName: 'meets', autoPrize: 2_500, autoPts: 120, autoField: 16 },
      { name: 'Golden Spike Series', level: MAJOR_TOUR_LEVEL, enterRank: 120, auto: 6, autoName: 'meets', autoPrize: 8_000, autoPts: 300, autoField: 16 },
    ],
    peak: [23, 30],
    retire: 36,
    proAge: 17,
    juniorAge: 7,
    maxStartAge: 26,
    olympic: 'summer',
    appeal: 0.75,
    costs: 20_000,
    risk: 0.05,
    injuries: ['Pulled Hamstring', 'Achilles Tendinitis', 'Stress Fracture', 'Shin Splints'],
    paid: 8,
    stipend: 30_000,
    appearance: 2_000_000,
    athletic: 0.3,
    pivot: { title: 'The Final', attack: 'Go out hard from the gun', steady: 'Run your own race', mind: 'Save it for one big finish', fail: 'You went out too fast and tied up with forty meters to go.' },
    eventWord: 'meet',
  },
  {
    id: 'swimming',
    name: 'Swimming',
    emoji: '\u{1F3CA}',
    group: 'individual',
    locale: /swim/i,
    title: 'Pro Swimmer',
    format: 'field',
    attrs: ['Stroke', 'Endurance', 'Starts & Turns', 'Power'],
    mental: 'Starts & Turns',
    disciplines: ['Freestyle Sprint', 'Distance Freestyle', 'Butterfly', 'Backstroke', 'Breaststroke', 'Individual Medley'],
    events: [
      { id: 'nat', name: '{demonym} Swimming Championships', tier: 'minor', prize: 3_000, pts: 150, field: 24, onlyTier: 0 },
      { id: 'ag1', name: 'Aqua Grand Prix {city}', tier: 'tour', prize: 15_000, pts: 500, field: 24, minRank: 150 },
      { id: 'ag2', name: 'Aqua Grand Prix {city}', tier: 'tour', prize: 15_000, pts: 500, field: 24, minRank: 150 },
      { id: 'agf', name: 'Aqua Grand Prix Final', tier: 'finals', prize: 50_000, pts: 1500, field: 12, minRank: 12 },
      { id: 'wsc', name: 'World Swim Championships', tier: 'major', prize: 20_000, pts: 2000, field: 40, minRank: 48, years: 'odd' },
    ],
    tiers: [
      { name: 'National Circuit', level: 58, auto: 4, autoName: 'meets', autoPrize: 1_500, autoPts: 120, autoField: 16 },
      { name: 'Aqua Grand Prix', level: MAJOR_TOUR_LEVEL, enterRank: 120, auto: 5, autoName: 'meets', autoPrize: 5_000, autoPts: 300, autoField: 16 },
    ],
    peak: [20, 27],
    retire: 32,
    proAge: 16,
    juniorAge: 5,
    maxStartAge: 23,
    olympic: 'summer',
    appeal: 0.6,
    costs: 15_000,
    risk: 0.025,
    injuries: ["Swimmer's Shoulder", 'Lower Back Strain', 'Knee Tendinitis'],
    paid: 8,
    stipend: 30_000,
    appearance: 900_000,
    athletic: 0.3,
    pivot: { title: 'The Final', attack: 'Explode off the blocks', steady: 'Swim your splits', mind: 'Nail every turn', fail: 'You false-started. The silence in the arena was deafening.' },
    eventWord: 'meet',
  },
  {
    id: 'cycling',
    name: 'Cycling',
    emoji: '\u{1F6B4}',
    group: 'individual',
    locale: /cycling|biking/i,
    title: 'Pro Cyclist',
    format: 'field',
    attrs: ['Climbing', 'Sprinting', 'Time Trial', 'Endurance'],
    mental: 'Endurance',
    disciplines: ['Climber', 'Sprinter', 'Time Trialist', 'All-Rounder'],
    events: [
      { id: 'nat', name: '{demonym} Road Championships', tier: 'minor', prize: 5_000, pts: 150, field: 120, onlyTier: 0 },
      { id: 'spr', name: 'Spring Classic of {city}', tier: 'tour', prize: 20_000, pts: 500, field: 175 },
      { id: 'cob', name: 'The Cobbled Inferno', tier: 'tour', prize: 30_000, pts: 800, field: 175, minTier: 1 },
      { id: 'tds', name: 'Tour des Sommets', tier: 'major', prize: 600_000, pts: 2000, field: 176, minTier: 1 },
      { id: 'gdc', name: 'Giro delle Colline', tier: 'major', prize: 300_000, pts: 1500, field: 176, minTier: 1 },
      { id: 'vds', name: 'Vuelta del Sol', tier: 'major', prize: 250_000, pts: 1300, field: 176, minTier: 1 },
      { id: 'wrc', name: 'World Road Championships', tier: 'finals', prize: 40_000, pts: 1200, field: 150, minRank: 100 },
    ],
    tiers: [
      { name: 'Continental Circuit', level: 58, auto: 10, autoName: 'races', autoPrize: 4_000, autoPts: 80, autoField: 150, salary: [18_000, 45_000] },
      {
        name: 'World Tour',
        level: MAJOR_TOUR_LEVEL,
        enterRank: 150,
        auto: 12,
        autoName: 'races',
        autoPrize: 15_000,
        autoPts: 250,
        autoField: 170,
        salary: [60_000, 6_000_000],
        teams: ['Team Alpenglow', 'Velocity Pro Cycling', 'Equinox-Tempest', 'Northwind Cycling', 'Granite Peak Pro Team', 'Solstice Racing', 'Cascade Velo', 'Lion Rampant Cycling', 'Mistral Pro Team', 'Andes Condor Cycling'],
      },
    ],
    peak: [25, 33],
    retire: 38,
    proAge: 18,
    juniorAge: 9,
    maxStartAge: 26,
    olympic: 'summer',
    appeal: 0.6,
    costs: 8_000,
    risk: 0.06,
    injuries: ['Broken Collarbone', 'Road Rash', 'Fractured Wrist', 'Knee Tendinitis'],
    paid: 20,
    stipend: 15_000,
    appearance: 600_000,
    athletic: 0.3,
    pivot: { title: 'The Final Climb', attack: 'Attack on the final climb', steady: 'Stay tucked in the bunch', mind: 'Bluff, then sprint for the line', fail: 'You attacked too early and got swallowed by the peloton.' },
    eventWord: 'race',
    knocks: 0.5,
  },
  {
    id: 'motor',
    name: 'Motor Racing',
    emoji: '\u{1F3CE}\u{FE0F}',
    group: 'individual',
    locale: /motor|formula|rally|speedway|karting/i,
    title: 'Racing Driver',
    format: 'race',
    attrs: ['Racecraft', 'Qualifying Pace', 'Tire Management', 'Wet-Weather Driving'],
    mental: 'Racecraft',
    events: [
      { id: 'fj1', name: 'Formula Junior: {city} Round', tier: 'minor', prize: 0, pts: 25, field: 30, onlyTier: 0 },
      { id: 'fj2', name: 'Formula Junior: Street Race of {city}', tier: 'minor', prize: 0, pts: 25, field: 30, onlyTier: 0 },
      { id: 'ff1', name: 'Formula Feeder: {city} Feature Race', tier: 'tour', prize: 20_000, pts: 25, field: 22, onlyTier: 1 },
      { id: 'ff2', name: 'Formula Feeder: Harbour Sprint', tier: 'tour', prize: 20_000, pts: 25, field: 22, onlyTier: 1 },
      { id: 'hgp', name: 'Harbour Grand Prix', tier: 'major', prize: 250_000, pts: 25, field: 20, minTier: 2 },
      { id: 'home', name: '{demonym} Grand Prix', tier: 'tour', prize: 100_000, pts: 25, field: 20, minTier: 2 },
      { id: 'dgp', name: 'Desert Night Grand Prix', tier: 'tour', prize: 100_000, pts: 25, field: 20, minTier: 2 },
      { id: 'ogp', name: 'Old Speedway Grand Prix', tier: 'tour', prize: 100_000, pts: 25, field: 20, minTier: 2 },
      { id: 'fin', name: 'Season Finale under the Lights', tier: 'finals', prize: 150_000, pts: 25, field: 20, minTier: 2 },
    ],
    tiers: [
      { name: 'Formula Junior', level: 58, auto: 14, autoName: 'races', autoPrize: 0, autoPts: 25, autoField: 30, seatCost: 250_000, teams: ['Torque Junior Racing', 'Pinewood Motorsport', 'Redline Academy', 'Carbon Kids GP', 'Turbo Owl Racing', 'Gearhead Junior Team'] },
      { name: 'Formula Feeder', level: 66, auto: 18, autoName: 'races', autoPrize: 5_000, autoPts: 25, autoField: 22, seatCost: 700_000, teams: ['Meridian Racing', 'Velox Feeder Team', 'Kestrel Motorsport', 'Blue Comet GP', 'Fennec Racing', 'Sable Motorsport'] },
      { name: 'Formula Prime', level: 76, auto: 19, autoName: 'Grands Prix', autoPrize: 50_000, autoPts: 25, autoField: 20, salary: [900_000, 45_000_000], teams: ['Corsa Fenice', 'Silverline Motorsport', 'Vortex Racing', 'Northstar GP', 'Halcyon Racing', 'Mirage Motorsport', 'Ironclad F-Team', 'Tsunami Racing', 'Bluewater Racing', 'Gryphon Grand Prix'] },
    ],
    peak: [25, 35],
    retire: 42,
    proAge: 16,
    juniorAge: 8,
    maxStartAge: 24,
    olympic: null,
    appeal: 1,
    costs: 0,
    risk: 0.03,
    injuries: ['Broken Leg', 'Fractured Vertebra', 'Concussion', 'Broken Wrist'],
    paid: 10,
    stipend: 0,
    appearance: 0,
    athletic: 0.1,
    pivot: { title: 'Final Laps', attack: 'Dive-bomb into Turn 1', steady: 'Hold position and bring it home', mind: 'Gamble on a late pit stop', fail: 'You locked up, ran wide and took both of you out.' },
    eventWord: 'race',
    knocks: 0.5,
  },
  {
    id: 'ski',
    name: 'Alpine Skiing',
    emoji: '\u{26F7}\u{FE0F}',
    group: 'individual',
    locale: /ski|biathlon/i,
    title: 'Pro Skier',
    format: 'field',
    attrs: ['Technique', 'Speed', 'Nerve', 'Fitness'],
    mental: 'Nerve',
    disciplines: ['Downhill', 'Slalom', 'Giant Slalom', 'Super-G'],
    events: [
      { id: 'nat', name: '{demonym} Ski Championships', tier: 'minor', prize: 3_000, pts: 150, field: 60, onlyTier: 0 },
      { id: 'wc1', name: 'White Peaks World Cup: Grauhorn', tier: 'tour', prize: 45_000, pts: 500, field: 60, minRank: 150 },
      { id: 'wc2', name: 'White Peaks World Cup: Val Brisa', tier: 'tour', prize: 45_000, pts: 500, field: 60, minRank: 150 },
      { id: 'wcf', name: 'Crystal Globe Finals', tier: 'finals', prize: 80_000, pts: 1500, field: 25, minRank: 25 },
      { id: 'wsc', name: 'World Ski Championships', tier: 'major', prize: 60_000, pts: 2000, field: 60, minRank: 80, years: 'odd' },
    ],
    tiers: [
      { name: 'Continental Cup', level: 58, auto: 6, autoName: 'races', autoPrize: 2_000, autoPts: 100, autoField: 60 },
      { name: 'White Peaks World Cup', level: MAJOR_TOUR_LEVEL, enterRank: 100, auto: 7, autoName: 'World Cup races', autoPrize: 30_000, autoPts: 320, autoField: 60 },
    ],
    peak: [24, 32],
    retire: 37,
    proAge: 16,
    juniorAge: 5,
    maxStartAge: 24,
    needs: 'snow',
    olympic: 'winter',
    appeal: 0.55,
    costs: 30_000,
    risk: 0.07,
    injuries: ['Torn ACL', 'Broken Leg', 'Dislocated Shoulder', 'Concussion'],
    paid: 30,
    stipend: 25_000,
    appearance: 500_000,
    athletic: 0.25,
    pivot: { title: 'Second Run', attack: 'Take the risky line', steady: 'Ski it clean', mind: 'Visualize every gate', fail: 'You straddled a gate and slid down the hill on your back.' },
    eventWord: 'race',
    knocks: 0.6,
  },
  {
    id: 'snowboard',
    name: 'Snowboarding',
    emoji: '\u{1F3C2}',
    group: 'individual',
    locale: /snowboard/i,
    title: 'Pro Snowboarder',
    format: 'field',
    attrs: ['Tricks', 'Amplitude', 'Style', 'Nerve'],
    mental: 'Style',
    disciplines: ['Halfpipe', 'Slopestyle', 'Snowboard Cross'],
    events: [
      { id: 'reg', name: '{city} Rail Jam', tier: 'minor', prize: 5_000, pts: 150, field: 40, onlyTier: 0 },
      { id: 'sh1', name: 'Shred Open: Mont Givre', tier: 'tour', prize: 40_000, pts: 500, field: 40, minRank: 150 },
      { id: 'fbg', name: 'The Frostbite Games', tier: 'major', prize: 75_000, pts: 1500, field: 12, minRank: 20 },
      { id: 'swc', name: 'Snowboard World Championships', tier: 'major', prize: 40_000, pts: 2000, field: 40, minRank: 80, years: 'odd' },
    ],
    tiers: [
      { name: 'Amateur Circuit', level: 58, auto: 5, autoName: 'contests', autoPrize: 2_000, autoPts: 100, autoField: 40 },
      { name: 'World Snowboard Tour', level: MAJOR_TOUR_LEVEL, enterRank: 100, auto: 5, autoName: 'contests', autoPrize: 25_000, autoPts: 320, autoField: 40 },
    ],
    peak: [19, 28],
    retire: 34,
    proAge: 16,
    juniorAge: 7,
    maxStartAge: 24,
    needs: 'snow',
    olympic: 'winter',
    appeal: 0.65,
    costs: 15_000,
    risk: 0.08,
    injuries: ['Broken Wrist', 'Torn ACL', 'Concussion', 'Bruised Tailbone'],
    paid: 12,
    stipend: 15_000,
    appearance: 700_000,
    athletic: 0.2,
    pivot: { title: 'Last Run', attack: 'Throw the never-landed trick', steady: 'Land your safe run', mind: 'Ride the crowd', fail: 'You under-rotated and slammed into the pipe wall.' },
    eventWord: 'contest',
    knocks: 0.8,
  },
  {
    id: 'surf',
    name: 'Surfing',
    emoji: '\u{1F3C4}',
    group: 'individual',
    locale: /surf/i,
    title: 'Pro Surfer',
    format: 'field',
    attrs: ['Wave Reading', 'Paddle Power', 'Maneuvers', 'Barrel Riding'],
    mental: 'Wave Reading',
    events: [
      { id: 'qs1', name: 'Qualifying Series: {city}', tier: 'minor', prize: 10_000, pts: 150, field: 96, onlyTier: 0 },
      { id: 'qs2', name: 'Qualifying Series: {city}', tier: 'minor', prize: 10_000, pts: 150, field: 96, onlyTier: 0 },
      { id: 'trp', name: 'Thunder Reef Pro', tier: 'tour', prize: 100_000, pts: 800, field: 36, minTier: 1 },
      { id: 'bbc', name: 'Bellbird Beach Classic', tier: 'tour', prize: 100_000, pts: 800, field: 36, minTier: 1 },
      { id: 'mpb', name: 'Monster Point Big Wave Invitational', tier: 'major', prize: 120_000, pts: 2000, field: 24, minRank: 40 },
      { id: 'fin', name: 'Big Swell Tour Finals', tier: 'finals', prize: 200_000, pts: 1500, field: 5, minRank: 5, minTier: 1 },
    ],
    tiers: [
      { name: 'Qualifying Series', level: 58, auto: 8, autoName: 'contests', autoPrize: 6_000, autoPts: 120, autoField: 96 },
      { name: 'Big Swell Pro Tour', level: MAJOR_TOUR_LEVEL, enterRank: 40, auto: 6, autoName: 'tour stops', autoPrize: 80_000, autoPts: 500, autoField: 36 },
    ],
    peak: [21, 30],
    retire: 38,
    proAge: 16,
    juniorAge: 7,
    maxStartAge: 26,
    needs: 'coast',
    olympic: 'summer',
    appeal: 0.65,
    costs: 18_000,
    risk: 0.05,
    injuries: ['Reef Cuts', 'Dislocated Shoulder', 'Sprained Knee', 'Concussion'],
    paid: 16,
    stipend: 0,
    appearance: 600_000,
    athletic: 0.2,
    pivot: { title: 'Final Heat', attack: 'Wait for the bomb set', steady: 'Take every wave', mind: 'Win the paddle battle', fail: 'You waited for the perfect wave. It never came.' },
    eventWord: 'contest',
  },
  {
    id: 'skate',
    name: 'Skateboarding',
    emoji: '\u{1F6F9}',
    group: 'individual',
    locale: /skateboard/i,
    title: 'Pro Skateboarder',
    format: 'field',
    attrs: ['Tricks', 'Consistency', 'Style', 'Nerve'],
    mental: 'Consistency',
    disciplines: ['Street', 'Park', 'Vert'],
    events: [
      { id: 'jam', name: '{city} Skate Jam', tier: 'minor', prize: 3_000, pts: 150, field: 48, onlyTier: 0 },
      { id: 'ck1', name: 'Concrete Kings: {city}', tier: 'tour', prize: 30_000, pts: 500, field: 24, minRank: 150 },
      { id: 'mri', name: 'Mega Ramp Invitational', tier: 'tour', prize: 50_000, pts: 800, field: 12, minRank: 40 },
      { id: 'grf', name: 'Gravity Fest', tier: 'major', prize: 100_000, pts: 1500, field: 12, minRank: 25 },
      { id: 'wsk', name: 'World Skateboarding Championship', tier: 'major', prize: 40_000, pts: 2000, field: 40, minRank: 80 },
    ],
    tiers: [
      { name: 'Amateur Contests', level: 58, auto: 5, autoName: 'contests', autoPrize: 1_500, autoPts: 100, autoField: 48 },
      { name: 'Concrete Kings Tour', level: MAJOR_TOUR_LEVEL, enterRank: 100, auto: 4, autoName: 'contests', autoPrize: 20_000, autoPts: 320, autoField: 24 },
    ],
    peak: [17, 27],
    retire: 34,
    proAge: 16,
    juniorAge: 6,
    maxStartAge: 25,
    olympic: 'summer',
    appeal: 0.7,
    costs: 6_000,
    risk: 0.09,
    injuries: ['Broken Wrist', 'Sprained Ankle', 'Concussion', 'Bruised Everything'],
    paid: 10,
    stipend: 0,
    appearance: 800_000,
    athletic: 0.15,
    pivot: { title: 'Final Run', attack: 'Go for a trick nobody has landed', steady: 'Land your safe run', mind: 'Feed off the crowd', fail: 'You slammed so hard the crowd went quiet. Then you got up and bowed.' },
    eventWord: 'contest',
    knocks: 0.8,
  },
  {
    id: 'gymnastics',
    name: 'Gymnastics',
    emoji: '\u{1F938}',
    group: 'individual',
    locale: /gymnastic/i,
    title: 'Elite Gymnast',
    format: 'field',
    attrs: ['Strength', 'Flexibility', 'Execution', 'Difficulty'],
    mental: 'Execution',
    disciplines: ['All-Around', 'Floor', 'Vault', 'Bars'],
    events: [
      { id: 'nat', name: '{demonym} Gymnastics Championships', tier: 'minor', prize: 2_000, pts: 150, field: 30, onlyTier: 0 },
      { id: 'awc', name: 'Apparatus World Cup: {city}', tier: 'tour', prize: 8_000, pts: 500, field: 24, minRank: 150 },
      { id: 'cnt', name: 'Continental Championships', tier: 'tour', prize: 5_000, pts: 800, field: 30, minRank: 120 },
      { id: 'wgc', name: 'World Gymnastics Championships', tier: 'major', prize: 15_000, pts: 2000, field: 40, minRank: 60 },
    ],
    tiers: [
      { name: 'National Program', level: 58, auto: 3, autoName: 'competitions', autoPrize: 1_000, autoPts: 120, autoField: 24 },
      { name: 'World Cup Circuit', level: MAJOR_TOUR_LEVEL, enterRank: 100, auto: 3, autoName: 'World Cup events', autoPrize: 4_000, autoPts: 300, autoField: 24 },
    ],
    peak: [16, 22],
    retire: 28,
    proAge: 16,
    juniorAge: 4,
    maxStartAge: 19,
    olympic: 'summer',
    appeal: 0.6,
    costs: 12_000,
    risk: 0.06,
    injuries: ['Torn Achilles', 'Sprained Wrist', 'Stress Fracture', 'Lower Back Strain'],
    paid: 8,
    stipend: 25_000,
    appearance: 700_000,
    athletic: 0.3,
    pivot: { title: 'Final Rotation', attack: 'Max out your difficulty', steady: 'Hit a clean routine', mind: 'Trust your muscle memory', fail: 'You stuck everything except the landing, which you stuck with your face.' },
    eventWord: 'competition',
  },
  {
    id: 'skating',
    name: 'Figure Skating',
    emoji: '\u{26F8}\u{FE0F}',
    group: 'individual',
    locale: /figure skating|^skating/i,
    title: 'Figure Skater',
    format: 'field',
    attrs: ['Jumps', 'Spins', 'Artistry', 'Stamina'],
    mental: 'Artistry',
    disciplines: ['Singles', 'Pairs', 'Ice Dance'],
    events: [
      { id: 'nat', name: '{demonym} Figure Skating Championships', tier: 'minor', prize: 2_000, pts: 150, field: 24, onlyTier: 0 },
      { id: 'cb1', name: 'Crystal Blade Series: {city}', tier: 'tour', prize: 18_000, pts: 500, field: 12, minRank: 120 },
      { id: 'cb2', name: 'Crystal Blade Series: {city}', tier: 'tour', prize: 18_000, pts: 500, field: 12, minRank: 120 },
      { id: 'cbf', name: 'Crystal Blade Final', tier: 'finals', prize: 25_000, pts: 1500, field: 6, minRank: 6 },
      { id: 'wfs', name: 'World Figure Skating Championships', tier: 'major', prize: 70_000, pts: 2000, field: 30, minRank: 50 },
    ],
    tiers: [
      { name: 'Junior & National Events', level: 58, auto: 3, autoName: 'competitions', autoPrize: 1_000, autoPts: 120, autoField: 24 },
      { name: 'Crystal Blade Series', level: MAJOR_TOUR_LEVEL, enterRank: 80, auto: 2, autoName: 'competitions', autoPrize: 8_000, autoPts: 300, autoField: 12 },
    ],
    peak: [18, 26],
    retire: 30,
    proAge: 16,
    juniorAge: 4,
    maxStartAge: 20,
    needs: 'rink',
    olympic: 'winter',
    appeal: 0.7,
    costs: 25_000,
    risk: 0.05,
    injuries: ['Sprained Ankle', 'Hip Strain', 'Stress Fracture', 'Concussion'],
    paid: 8,
    stipend: 20_000,
    appearance: 1_200_000,
    athletic: 0.2,
    pivot: { title: 'Free Skate', attack: 'Throw in a quad', steady: 'Skate it clean', mind: 'Sell the artistry to the judges', fail: 'You popped the quad, then a double, then your confidence.' },
    eventWord: 'competition',
  },
  {
    id: 'badminton',
    name: 'Badminton',
    emoji: '\u{1F3F8}',
    group: 'individual',
    locale: /^badminton$/i,
    title: 'Pro Badminton Player',
    format: 'bracket',
    attrs: ['Smash', 'Net Play', 'Footwork', 'Stamina'],
    mental: 'Net Play',
    events: [
      { id: 'int', name: '{city} International', tier: 'minor', prize: 8_000, pts: 100, field: 32, onlyTier: 0 },
      { id: 'sup', name: '{city} Super Series', tier: 'tour', prize: 90_000, pts: 800, field: 32, minRank: 60 },
      { id: 'ane', name: 'All-Nations Championships', tier: 'major', prize: 100_000, pts: 1500, field: 32, minRank: 40 },
      { id: 'wbc', name: 'World Badminton Championships', tier: 'major', prize: 60_000, pts: 2000, field: 64, minRank: 64 },
      { id: 'fin', name: 'Shuttle World Tour Finals', tier: 'finals', prize: 200_000, pts: 1500, field: 8, minRank: 8 },
    ],
    tiers: [
      { name: 'International Series', level: 58, auto: 10, autoName: 'tournaments', autoPrize: 5_000, autoPts: 90, autoField: 32 },
      { name: 'Shuttle World Tour', level: MAJOR_TOUR_LEVEL, enterRank: 80, auto: 10, autoName: 'tour events', autoPrize: 30_000, autoPts: 300, autoField: 32 },
    ],
    peak: [22, 30],
    retire: 35,
    proAge: 16,
    juniorAge: 6,
    maxStartAge: 25,
    olympic: 'summer',
    appeal: 0.55,
    costs: 12_000,
    risk: 0.03,
    injuries: ['Achilles Tendinitis', 'Sprained Ankle', 'Shoulder Strain'],
    paid: 32,
    stipend: 15_000,
    appearance: 500_000,
    athletic: 0.2,
    pivot: { title: 'Rubber Game', attack: 'Jump smash everything', steady: 'Out-rally them', mind: 'Fake the drop shot', fail: 'Your smash found the net four times in a row.' },
    eventWord: 'tournament',
  },
  {
    id: 'tabletennis',
    name: 'Table Tennis',
    emoji: '\u{1F3D3}',
    group: 'individual',
    locale: /^table tennis$|ping pong/i,
    title: 'Pro Table Tennis Player',
    format: 'bracket',
    attrs: ['Spin', 'Speed', 'Footwork', 'Reading'],
    mental: 'Reading',
    events: [
      { id: 'cha', name: '{city} Challenger', tier: 'minor', prize: 5_000, pts: 100, field: 32, onlyTier: 0 },
      { id: 'sms', name: 'Spin Masters {city}', tier: 'tour', prize: 40_000, pts: 800, field: 32, minRank: 64 },
      { id: 'wtt', name: 'World Table Tennis Championships', tier: 'major', prize: 100_000, pts: 2000, field: 64, minRank: 64 },
      { id: 'fin', name: 'Spin Masters Finals', tier: 'finals', prize: 100_000, pts: 1500, field: 16, minRank: 16 },
    ],
    tiers: [
      { name: 'Challenger Series', level: 58, auto: 10, autoName: 'tournaments', autoPrize: 3_000, autoPts: 90, autoField: 32 },
      { name: 'Spin Masters Tour', level: MAJOR_TOUR_LEVEL, enterRank: 80, auto: 8, autoName: 'tour events', autoPrize: 15_000, autoPts: 300, autoField: 32 },
    ],
    peak: [22, 32],
    retire: 38,
    proAge: 16,
    juniorAge: 6,
    maxStartAge: 26,
    olympic: 'summer',
    appeal: 0.4,
    costs: 8_000,
    risk: 0.015,
    injuries: ['Wrist Tendinitis', 'Lower Back Strain'],
    paid: 32,
    stipend: 12_000,
    appearance: 300_000,
    athletic: 0.1,
    pivot: { title: 'Deciding Game', attack: 'Loop everything hard', steady: 'Keep it on the table', mind: 'Serve tricks they have never seen', fail: 'Your serve hit the edge of the table and flew into the crowd.' },
    eventWord: 'tournament',
  },
  {
    id: 'darts',
    name: 'Darts',
    emoji: '\u{1F3AF}',
    group: 'individual',
    locale: /darts/i,
    title: 'Pro Darts Player',
    format: 'bracket',
    attrs: ['Scoring', 'Checkouts', 'Consistency', 'Nerve'],
    mental: 'Nerve',
    events: [
      { id: 'pub', name: '{city} Open', tier: 'minor', prize: 5_000, pts: 100, field: 64, onlyTier: 0 },
      { id: 'mat', name: 'Arrows Matchplay', tier: 'tour', prize: 200_000, pts: 1000, field: 32, minRank: 32 },
      { id: 'grp', name: 'Grand Prix of Darts', tier: 'tour', prize: 120_000, pts: 800, field: 32, minRank: 32 },
      { id: 'pal', name: 'The Palace World Darts Championship', tier: 'major', prize: 600_000, pts: 2000, field: 96, minRank: 96 },
    ],
    tiers: [
      { name: 'Challenge Tour', level: 58, auto: 12, autoName: 'floor events', autoPrize: 2_000, autoPts: 80, autoField: 64 },
      { name: 'Arrows Pro Tour', level: MAJOR_TOUR_LEVEL, enterRank: 64, auto: 12, autoName: 'Pro Tour events', autoPrize: 15_000, autoPts: 250, autoField: 64 },
    ],
    peak: [28, 45],
    retire: 60,
    proAge: 18,
    juniorAge: 12,
    maxStartAge: 45,
    olympic: null,
    appeal: 0.35,
    costs: 6_000,
    risk: 0.005,
    injuries: ['Dartitis', 'Shoulder Strain'],
    paid: 64,
    stipend: 0,
    appearance: 400_000,
    athletic: 0,
    pivot: { title: 'Final Leg', attack: 'Go for the nine-darter', steady: 'Treble 20, treble 20, treble 20', mind: 'Make them wait at the oche', fail: 'You bounced out of the bullseye. The crowd sang about it.' },
    eventWord: 'tournament',
  },
  {
    id: 'judo',
    name: 'Judo',
    emoji: '\u{1F94B}',
    group: 'combat',
    locale: /judo/i,
    title: 'Judoka',
    format: 'bracket',
    attrs: ['Throws', 'Groundwork', 'Grip Fighting', 'Conditioning'],
    mental: 'Grip Fighting',
    disciplines: ['Lightweight', 'Middleweight', 'Heavyweight'],
    events: [
      { id: 'nat', name: '{demonym} Judo Championships', tier: 'minor', prize: 1_000, pts: 150, field: 32, onlyTier: 0 },
      { id: 'tgp', name: 'Tatami Grand Prix {city}', tier: 'tour', prize: 3_000, pts: 500, field: 32, minRank: 150 },
      { id: 'tgs', name: 'Tatami Grand Slam {city}', tier: 'tour', prize: 5_000, pts: 1000, field: 48, minRank: 100 },
      { id: 'wjc', name: 'World Judo Championships', tier: 'major', prize: 26_000, pts: 2000, field: 64, minRank: 64 },
      { id: 'fin', name: 'Tatami Masters', tier: 'finals', prize: 50_000, pts: 1500, field: 16, minRank: 16 },
    ],
    tiers: [
      { name: 'Continental Opens', level: 58, auto: 5, autoName: 'opens', autoPrize: 500, autoPts: 100, autoField: 32 },
      { name: 'Tatami World Tour', level: MAJOR_TOUR_LEVEL, enterRank: 100, auto: 5, autoName: 'World Tour events', autoPrize: 2_000, autoPts: 300, autoField: 32 },
    ],
    peak: [23, 30],
    retire: 35,
    proAge: 16,
    juniorAge: 5,
    maxStartAge: 26,
    olympic: 'summer',
    appeal: 0.35,
    costs: 8_000,
    risk: 0.06,
    injuries: ['Dislocated Elbow', 'Torn Knee Ligament', 'Broken Collarbone', 'Concussion'],
    paid: 8,
    stipend: 25_000,
    appearance: 200_000,
    athletic: 0.3,
    pivot: { title: 'Golden Score', attack: 'Go for a big ippon throw', steady: 'Win the grip fight on penalties', mind: 'Bait them into a counter', fail: 'You went for the throw and got countered flat on your back. Ippon.' },
    eventWord: 'tournament',
    knocks: 0.5,
  },
  {
    id: 'wrestling',
    name: 'Olympic Wrestling',
    emoji: '\u{1F93C}',
    group: 'combat',
    locale: /^wrestling|kokpar/i,
    title: 'Olympic-Style Wrestler',
    format: 'bracket',
    attrs: ['Takedowns', 'Top Control', 'Defense', 'Conditioning'],
    mental: 'Defense',
    disciplines: ['Freestyle', 'Greco-Roman'],
    events: [
      { id: 'nat', name: '{demonym} Wrestling Championships', tier: 'minor', prize: 1_000, pts: 150, field: 32, onlyTier: 0 },
      { id: 'rs1', name: 'Ranking Series: {city}', tier: 'tour', prize: 3_000, pts: 500, field: 32, minRank: 150 },
      { id: 'rs2', name: 'Ranking Series: {city}', tier: 'tour', prize: 3_000, pts: 500, field: 32, minRank: 150 },
      { id: 'wwc', name: 'World Wrestling Championships', tier: 'major', prize: 20_000, pts: 2000, field: 32, minRank: 64 },
    ],
    tiers: [
      { name: 'Open Tournaments', level: 58, auto: 5, autoName: 'open tournaments', autoPrize: 500, autoPts: 100, autoField: 32 },
      { name: 'Ranking Series', level: MAJOR_TOUR_LEVEL, enterRank: 100, auto: 4, autoName: 'tournaments', autoPrize: 2_000, autoPts: 300, autoField: 32 },
    ],
    peak: [23, 31],
    retire: 36,
    proAge: 16,
    juniorAge: 6,
    maxStartAge: 26,
    olympic: 'summer',
    appeal: 0.3,
    costs: 6_000,
    risk: 0.06,
    injuries: ['Cauliflower Ear', 'Torn Knee Ligament', 'Separated Shoulder', 'Neck Strain'],
    paid: 8,
    stipend: 25_000,
    appearance: 150_000,
    athletic: 0.35,
    pivot: { title: 'Final Period', attack: 'Shoot a double-leg', steady: 'Ride out the clock', mind: 'Bait them into a bad shot', fail: 'You shot in and got stuffed, spun, and nearly pinned.' },
    eventWord: 'tournament',
    knocks: 0.4,
  },
]

export function indSport(id: string | null | undefined): IndSport | undefined {
  return IND_SPORTS.find((s) => s.id === id)
}

// Share of the winner's prize/points by bracket round reached (index 0 = won it all).
export const BRACKET_SHARE = [1, 0.5, 0.27, 0.15, 0.08, 0.05, 0.03, 0.018]
export const BRACKET_POINTS = [1, 0.6, 0.36, 0.18, 0.09, 0.045, 0.022, 0.005]
export const BRACKET_ROUND = ['won the title', 'reached the final', 'reached the semifinals', 'reached the quarterfinals', 'reached the round of 16', 'reached the round of 32', 'reached the round of 64', 'lost in the first round']

/** Share of the winner's prize by finishing place in a field event (1-based). */
export function placeShare(place: number, paid: number): number {
  if (place < 1 || place > paid) return 0
  const top = [1, 0.6, 0.38, 0.27, 0.22, 0.2, 0.18, 0.165, 0.15, 0.135]
  if (place <= 10) return top[place - 1]
  if (place <= 20) return 0.12 - ((place - 11) * 0.06) / 9
  if (place <= 40) return 0.05 - ((place - 21) * 0.03) / 19
  return Math.max(0.006, 0.015 - ((place - 41) * 0.009) / Math.max(1, paid - 41))
}

/** Ranking points by finishing place in a field event. */
export function placePoints(place: number): number {
  if (place < 1) return 0
  const top = [1, 0.7, 0.5, 0.4, 0.33, 0.27, 0.22, 0.18, 0.15, 0.12]
  if (place <= 10) return top[place - 1]
  if (place <= 30) return 0.1 - ((place - 11) * 0.08) / 19
  return 0.01
}
