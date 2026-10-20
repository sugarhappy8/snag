# Area I: remaining special careers (digest)

Read-only audit of main v4.0.2. Lines are `wc -l` of `src/game/special/<name>*.ts`; tests are the dedicated test files. Business benchmark: `src/game/business/`, 189 files, 63,065 lines (deep tech 7.2k, markets 5.5k, conglomerates 4.1k, funds 3.6k, nepo and dynasty 3.5k, competition roster 3.5k, boards 2.9k).

## 1. What exists today

Rubric from the slice-1 spec: Loop, Choices, World (era, country), Rivals (named peers, ranking), Arcs (contracts, crises, legacy, exits). Business scores 5.

| Career | Source | Tests | Kit | Score | Honest state |
|---|---|---|---|---|---|
| Actor | 5,062 | 5,103 | yes | 4 | agent, manager, pipeline, awards, 5 crises |
| Astronaut | 3,742 | 4,163 | yes | 4 | corps, class, flights, inquiries, 7 crises |
| Model | 3,646 | 4,026 | yes | 4 | season board, agencies, 3 exits |
| Musician | 3,777 | 4,593 | yes | 4 | label deal, format eras, chart, tour P&L, 7 events |
| Author | 1,159 | ~1,280 | no | 2 | works, serial focus and pace; one imprint name per format, one prize, no rivals |
| Influencer (`social.ts`) | 1,174 | ~40 | no | 2 | 6 era-gated platforms, 26 post types, viral roll, sponsor popup, hacks; no rivals, brand ledger, niche |
| Fame (`fame.ts`, Activities) | 1,016 | 0 | no | 2 | books, talk shows, merch, podcast, stunts; fixed text arrays |
| Politician | 2,889 + `nation/` 4,597 | ~1,900 | no | 3 | best legacy career: laws, budget, tariffs, votes, graft, case files, coups. Opponent is a random string; no staff, party machine, polling fog, war, UN or treaty |
| Sports | 9,188 | ~1,100 | no | 3 | team, 12 individual sports, MMA, boxing, sumo, wrestling, esports, Olympics, youth, coaching. League tables are strengths, individual fields are `leader x 0.84^i`; only fighting has rivals. No named roster, agent, draft, cap, ownership |
| Game employee | 4,369 | 1,329 | no | 3 | 4 tracks, 7 levels, crunch, layoffs, industry cycle, GameFest; studios are generated listings, no coworkers or rival studios |
| Street Hustler | 817 | 0 | no | 1 | 10 acts, 6 works a year, 4 encounters; pay not era-scaled |
| Military | 1,082 | 0 | no | 2 | 5 branches, two ladders, flat pay, deployment minefield, draft, medals; no unit, specialty, peers, academy |
| Crime (Activities: `crime.ts` 3,908, `underworld.ts` 215, `prison.ts` 2,459) | 6,582 | 493 | no | 3 | mafia family with 5 ranks and informant arc, heists, trials; not in the Special menu |

- Kit careers offer at most 1 choice and 2 notices a year (35% odds): about 5 to 7 crisis types each, against business's seven event modules.
- `career-money-scan.test.ts` and `careers-balance.test.ts` cover only `actor|astronaut|model|music`. The other eight careers have no conservation scan or balance matrix.
- Rivals are derived names, never Persons. Income comes from anonymous payers.
- The kit has no ledger, team, awards, exit, legacy, news, fog or text module. Each done career rebuilt them privately (actor-team, music CEREMONIES, model-exit, `adoptMaster`).

## 2. Gaps

1. Eight careers are single-loop: no rivals, ranking, or era and country world.
2. No career has news, showcase events, information fog or a non-repeating text deck.
3. Staff quality changes outcomes only for the actor's agent.
4. Only a likeness trust and a master inherit. Author IP, a studio, a team, a turf and a political machine die with the person.
5. No crossover graph; only astronaut and model have exits.
6. Sponsors, publishers, leagues and donors pay from nowhere, so no real ceilings.
7. The four done careers' own cut lists are the next layer (3b).
8. President has no war, UN or foreign policy (B owns the kernel).

## 3. Design

### 3a. Kit v2, built once (L, about 4k lines)
Modules in `special/kit/`: optional versioned state, capped lists, no `g.rng` in reads.
- **K1 ledger**: contract rows `{id, payer, terms snapshot, start, end, paid, recouped}`, paid only by `c.earn`. The payer is a world entity (brand, NPC company, league, state) with a yearly talent budget (A), so income has a ceiling.
- **K2 team**: generalise actor-team to agent, manager, publicist, lawyer, coach, editor, campaign chief. Family-seed candidates; quality lifts odds with diminishing returns and sets intel.
- **K3 peers**: roster names become Persons on first contact (feud, romance, hire, rival firm), at most 32 a life, shared with D.
- **K4 awards and charts**: ceremony engine on rosters by country and era; music and actor become clients.
- **K5 exits and crossovers**: typed edges with a gate, a cost and a carry-over (fame, contacts, assets). No free stat transfer.
- **K6 legacy**: generic inheritable asset (IP trust, catalogue, team, turf), valued and taxed once.
- **K7 news**: at most 3 typed items a year to E's feed; world news can trigger events.
- **K8 intel (fog)**: ranks, trends, offers and rival form shown as bands. Research = yearly budget x staff quality x ambition x labour hours, capped (H, C).
- **K9 text**: per-life no-repeat deck for every line pool (E).
- **K10 showcase**: a yearly stage (premiere, book fair, expo, summit) on the crisis engine (F).
- **K11 pace**: one career row in the Annual Report and one popup budget across all careers (E, G).

### 3b. Career feature lists
Every career gets the common frame: ladder with seat limits, yearly project loop, named roster with memory, K1 contracts, K2 team, K6 assets, about 8 crisis types plus small events, K4 awards, 3 exits, K7 to K10. Career-specific parts:

- **Author (L to XL, about 5k).** Named imprints and agents by country and era; print industry before 1990, e-book and self-publish from 2007; genre market by year. Query and submission queue, advance and royalty tiers, returns, series contract, translation and foreign rights, screen options priced from a studio's budget. Book fairs, bestseller list, prizes against named authors. Plagiarism, ghostwriting, censorship crises. Backlist inheritance. Exits: screenwriter, publisher founder, columnist, memoirist. The easiest first client of K1, K3, K4.
- **Influencer and fame (XL, about 7k).** One creator business: platform, niche, content calendar, algorithm shifts by year, follower quality (organic, fake), brand deals via K1 on a real ad budget, MCN, collabs with named creators, merch, cancellation and apology, creator awards, burnout. Fame stays the public-figure meter; every fame action feeds K7. Eras: 1990s homepages, 2005 video, 2010 photo apps, 2017 short video. Exits: actor, musician, own brand, politician.
- **Politician (L, about 4k beyond B).** Named opponents, party machine and donors as entities, campaign staff, poll error and fog, debates and primaries, cabinet and judges as real Persons, a foreign office and summits. War and UN actions belong to B. Exits: board seats, author, diplomat, party chair, exile (exists).
- **Sports (XL, three builds, about 15k).** (i) World: every league as persistent clubs with named rosters, standings, draft, trades, caps, transfers, agent, contract ledger, MVP races, injuries as a rehab desk. (ii) Ownership: a new Sports Franchise trade (J) with stadium, TV and sponsor pools. (iii) Coach, GM and pundit exits become real jobs. Esports and Olympics share the rosters.
- **Game employee (L, about 4k).** Persistent studios and publishers with project slates, coworkers as Persons, rival studios, GOTY races (K4), unions, equity and vesting, GameFest as K10, layoffs driven by the industry cycle. Exits: studio founder (exists), indie, streamer.
- **Street Hustler and crime, "Underworld" (XL, about 8k).** Hustler moves onto the kit (M); then turf, crew and heat as entities, rival crews, police pressure, a fence and laundering ledger with named counterparties, trials and prison as a real exit. Link the mafia family and `underworld.ts`. Keep every scheme abstract, as `underworld.ts` states.
- **Military (XL, about 7k).** Specialties, academy, units with peers, commands, promotion boards, deployments tied to B's wars, veteran benefits and pension. Exits: contractor, politician, police, astronaut.
- **Leftovers of the done four.** Actor (L): stage, voice, producer and director pivot, moving abroad, rival Persons, co-star romance, merch, studio contract screen. Astronaut (M): analog missions, language, multi-flight years, vehicles and crews as entities. Model (M): visas, image-rights estate, agency finances, crossover to actor and influencer. Musician (L): player-run label and publisher, sync, videos, fan clubs, 360 and publishing terms, band deals, international tours, merch.
- **New careers (short).** Promote ordinary Work Plan families (`workplace/`, 1,389 lines) into kit plug-ins, one import and one registry entry each. Order: Journalist (feeds K7), Scientist (C), Lawyer and Detective (cases from the crime sim), Doctor, Chef, Pilot, Coach. M to L each.

## 4. Work breakdown and order
0. Social fake-follower fix and a money scan over every legacy career file (S).
1. Kit v2: K1 to K6 (L), K7 to K11 stubs (M). Needs A, D, E, H.
2. Author (L to XL), Game employee (L).
3. Influencer and fame (XL), after E and F.
4. Politician (L), after B. 5. Military (XL), after B.
6. Underworld (XL), after D and A.
7. Sports world (XL), then franchise trade (XL, J).
8. Leftovers: music, actor (L each), then model, astronaut (M each).
9. New careers: journalist, scientist, then the rest.
Total about 60k source and 30k test lines, close to business's 63k. One Opus session at a time.

## 5. Risks and exploit paths
- **Fake followers (read, not run).** `social.ts` sells 1,000,000 followers for 70,000 (line 762). YouTube monetizes at 1,000 and pays 1 to 5 per subscriber a year (`payRate`) given 4 posts, so one pack returns about 1M to 5M a year; spam suspension is 24% a pack and followers cap only at 1e12. Fix first: paid followers earn nothing and do not verify, and a platform ad pool caps pay.
- **Sports.** Endorsements run to fame^3 x 6M across 3 deals from brands that lose nothing; some countries pay a fortune per medal. Franchise ownership is the new loop to guard (transfer fees, academy sales, TV pools): league-wide conservation and caps.
- **Author.** Adaptation fee is 1.5 per reader up to about 7.5M with no studio paying; sales read no era market size.
- **Politician.** Donors and favors must be entities with wealth; staff and machine must not lift graft caps (GDP-scaled today).
- **Underworld.** Loot, fence and laundering mint money unless victims, fences and heat are entities; seizure and prison are the sinks.
- **Military.** Flat pay ignores year and country; a contractor exit needs a wartime budget cap (B).
- **Label, film producing, club, merch.** Each is a new money source needing a world-audience pool (A).
- **Save and speed.** One optional record per career, capped lists, idempotent `settleYear`, heir starts clean except K6 assets.
- **Tests.** Extend `CAREER_SETUPS` and the money-scan regex to every new file; a 60-year probe per career in three strategies with an income cap in multiples of `typicalIncome`; an heir probe; render purity under deepFreeze; idempotent year replay.

## 6. Open questions
1. What is "as deep as business"? Default: the 5-layer rubric plus K1 to K11, about 5k to 8k source lines per top career.
2. Do sports franchises become a trade (56 to 57)? Default: yes, after the sports world.
3. Does Underworld get a Special Careers entry, kept abstract? Default: yes.
4. May rivals become real Persons? Default: on contact only, 32 a life.
5. Do heirs inherit career assets but not standing or memory? Default: yes.
