// Pace families of the event library (R3-Q8, E.T5): which events are different popups about the same kind of thing, so a family
// that just spoke weighs a quarter as much for 5 years (text/pace.ts). No `family` field on the 372 defs: this table names the
// ids, so a def never moves.
//
// The 15 EVENT_KINDS of events.ts (siblingFriction, neighbors, scam, ...) are families too, with their own name; events.ts joins
// the two (eventPaceFamily). This file holds the themes the kinds do not cover. A theme has at least 2 members and an id is in one
// family only (both are checked when the module loads and again in test/pace-families.test.ts). An event in no family has only
// its own cooldown. Together the 15 kinds and these themes are at most 40 families (test/pace-families.test.ts), which leaves the
// ask, company and career engines room under PACE.maxFamilies. Imports the pace key only.
import { paceKey } from '../text/pace'

/** Theme name to the ids in it. The names are the pace families ('pop.ev.<name>'). */
const THEMES: Readonly<Record<string, readonly string[]>> = {
  'work.office': ['work.teamBuilding', 'work.holidayParty', 'work.collection', 'work.afterHours'],
  'work.grind': ['work.overtime', 'work.mistake', 'work.layoffRumors', 'work.sickDay', 'work.rudeCustomer'],
  'school.mischief': ['school.classClown', 'school.troublemaker', 'school.sneeze', 'school.chatty', 'school.toiletPaper', 'school.ditch', 'school.juul'],
  'school.stage': ['school.play', 'school.instruments', 'school.scienceFair', 'school.spellingBee', 'kid.talentShow'],
  'teen.nights': ['teen.houseParty', 'school.dance', 'school.pepRally', 'teen.concert', 'teen.sneakOut', 'teen.curfew', 'family.teenSneaking'],
  street: ['adult.homeless', 'adult.streetPerformer', 'adult.charity', 'adult.strangerInsult', 'adult.witnessCrime'],
  illness: ['adult.fluSeason', 'adult.badMeal', 'family.parentHealth'],
  couple: ['family.anniversary', 'family.snoring', 'family.partnerPet', 'adult.blindDate'],
  visits: ['family.parentsVisit', 'family.inLaws', 'family.grandparentStory', 'elder.grandkidVisit'],
  friends: ['friend.newFriend', 'friend.bestFriend', 'friend.advice', 'friend.haircut', 'friend.unfriended', 'friend.rumor'],
  'late.life': ['elder.hearing', 'elder.carKeys', 'elder.retirementHome', 'elder.friendFuneral', 'elder.smartphone', 'elder.earlyBird', 'elder.bingo', 'elder.pickleball', 'elder.freeTime'],
  sos: ['sos.drowning', 'sos.fire', 'sos.snake', 'sos.cpr', 'sos.dog', 'sos.tree', 'sos.mugging', 'sos.car', 'sos.tracks', 'sos.disaster', 'sos.choking'],
  'prison.days': [
    'prison.caffeine', 'prison.fountain', 'prison.pica', 'prison.singalong', 'prison.gameDay', 'prison.library', 'prison.daisyChains', 'prison.contraband',
    'prison.tattoo', 'prison.roofJob', 'prison.visitation', 'prison.solitary', 'prison.cellmateNews', 'prison.reform', 'prison.snitchDeal', 'prison.wrongRelease',
    'prison.ged', 'prison.escapePlan', 'juvie.prankCall', 'juvie.halfBaked',
  ],
  // What an ordinary year felt like in each era (events/era-life.ts): the same kind of thing in different decades.
  'era.talk': [
    'era.1900.telegram', 'era.1900.firstWireless', 'era.1900.partyLine', 'era.1946.cb', 'era.1990s.pager', 'era.1990s.dialUp', 'era.1990s.firstEmail',
    'era.1990s.chatRoom', 'era.1990s.firstMobile', 'era.1990s.phoneKiosk', 'era.1990s.cyberCafe', 'era.2000s.messenger', 'era.2000s.textBill',
    'era.2000s.topFriends', 'era.2000s.flashing', 'era.2000s.firstSmartphone', 'era.2000s.mobileMoney', 'era.2000s.ringtone', 'era.2000s.alwaysOn',
    'era.2010s.borrowedPhone', 'era.2010s.familyChat', 'era.2010s.parentRequest', 'era.2010s.oldPost', 'era.2010s.ghosted', 'era.2010s.phoneFree',
    'era.2010s.inAppBill',
  ],
  'era.screens': [
    'era.1900.nickelodeon', 'era.1900.talkies', 'era.1900.pictureHall', 'era.1900.gramophone', 'era.1946.firstTV', 'era.1946.transistor', 'era.1946.rockRoll',
    'era.1946.sockHop', 'era.1946.popCraze', 'era.1946.disco', 'era.1980s.walkman', 'era.1980s.mixtape', 'era.1980s.videoStore', 'era.1980s.mtvVcr',
    'era.1980s.compactDisc', 'era.1980s.camcorder', 'era.1980s.liveAid', 'era.1980s.dayAfter', 'era.1980s.karaoke', 'era.1990s.sharedTv', 'era.1990s.videoHall',
    'era.2000s.fileSharing', 'era.2000s.mp3Player', 'era.2000s.memoryCard', 'era.2010s.streamingBinge', 'era.2010s.shortVideo',
  ],
  'era.play': [
    'era.1900.bicycle', 'era.1946.driveIn', 'era.1946.scooter', 'era.1980s.arcade', 'era.1980s.stickerAlbum', 'era.1980s.scaryMovie', 'era.1980s.homeComputer',
    'era.1990s.lanParty', 'era.1990s.pokemonCraze', 'era.1990s.toyCraze', 'era.1990s.rollerRink', 'era.1990s.tamagotchi', 'era.2000s.allNighter', 'era.2000s.lanHouse',
  ],
  'era.hard': [
    'era.1900.bankRun', 'era.1900.relief', 'era.1900.accident', 'era.1900.companyStore', 'era.1900.rails', 'era.1946.strike', 'era.1946.protest', 'era.1946.gasLine',
    'era.1990s.downsizing', 'era.1990s.y2kOvertime', 'era.1990s.dotcomOffer', 'era.2000s.dotcomBust', 'era.2010s.gigWork', 'era.2020s.remoteWork',
  ],
}

function flatten(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [family, ids] of Object.entries(THEMES)) {
    paceKey('ev', family)
    if (ids.length < 2) throw new Error(`events/families: the family "${family}" has fewer than 2 events`)
    for (const id of ids) {
      if (Object.hasOwn(out, id)) throw new Error(`events/families: "${id}" is in two families ("${out[id]}" and "${family}")`)
      out[id] = family
    }
  }
  return out
}

/** Event id to the theme family it belongs to. The ids of the 15 EVENT_KINDS are not here: their family is their kind (eventPaceFamily in events.ts). */
export const EVENT_FAMILIES: Readonly<Record<string, string>> = Object.freeze(flatten())

/** The theme family of an event, or undefined when it is in none. */
export function eventFamily(id: string): string | undefined {
  return Object.hasOwn(EVENT_FAMILIES, id) ? EVENT_FAMILIES[id] : undefined
}
