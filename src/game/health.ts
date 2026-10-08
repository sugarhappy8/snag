// Health: yearly stat drift, illnesses and addictions, death checks, and the Doctor
// menu (medical doctor, emergency room, alternative doctors, psychiatrist, witch
// doctor, optometrist, blood & plasma donation).
import {
  addHidden,
  addMoney,
  addStat,
  canAfford,
  count,
  formatMoney,
  inPrison,
  log,
  notice,
  parents,
  remember,
  scriptChoice,
  spend,
  useYearAction,
  yearActionsUsed,
} from './core'
import { localeOf, localTerm } from './data/locales'
import { eraLines } from './events/era'
import { ERA_DISEASES, eraCureFactor, eraDiseaseWeight, eraOldAgeFactor, eraSicknessBoost, medicalYear } from './history/events-medicine'
import { hasTech, isHistorical } from './history/timeline'
import { isIndustryLegal } from './data/markets'
import { killCharacter } from './death'
import { hasTalent } from './talents'
import { chance, pick, randFloat, randInt, uid, weightedPick } from './rng'
import { defineScript } from './scripts'
import { getCountry, NAME_POOLS } from './world'
import type { ChoiceOption, Condition, ConditionKind, GameState, Gender, Json, MenuAction, MenuGroup, MenuNode, Person } from './types'

// ---------------------------------------------------------------------------
// Disease catalog

export type AltTherapy = 'acupuncture' | 'chiropractic' | 'colon' | 'homeopathy'

export interface DiseaseDef {
  name: string
  kind: ConditionKind
  /** Severity range when contracted (1-100). */
  sev: [number, number]
  /** Treatment cost tier: 1 minor ... 4 cancer-level. */
  tier: 1 | 2 | 3 | 4
  /** Chance a medical doctor cures it per treatment (0 = incurable, can only be managed). */
  cure: number
  /** Chance per year that it clears up by itself. */
  self: number
  /** Eligible ages (inclusive). */
  ages: [number, number]
  /** Relative chance of being the illness picked this year. */
  weight: number
  gender?: Gender
  /** Obvious ailments are known right away; the rest stay undiagnosed until a doctor visit. */
  obvious?: boolean
  symptoms: string[]
  /** Cause of death if it kills you. */
  deadly?: string
  /** Average yearly severity increase while it lasts. */
  progress?: number
  /** Alternative therapies that can cure it. */
  alt?: AltTherapy[]
  /** Extra yearly stat damage. */
  looks?: number
  smarts?: number
  mood?: number
  /** Only contracted through intimacy (randomly only if the character has had partners). */
  sti?: boolean
  /** Bizarre ailments: more likely in idle lives. */
  odd?: boolean
  cancer?: boolean
}

const CANCER_SYMPTOMS = [
  "You've been losing weight without trying, and you're exhausted all the time.",
  "You found a strange lump that definitely wasn't there last month.",
  "You've had night sweats and a dull ache that won't go away.",
  'You feel weak and run-down no matter how much you sleep.',
  'Something feels wrong. You have a pain that keeps getting worse.',
]

function cancer(name: string, weight: number, cure: number, opts: Partial<DiseaseDef> = {}): DiseaseDef {
  return {
    name,
    kind: 'disease',
    sev: [35, 60],
    tier: 4,
    cure,
    self: 0,
    ages: [18, 130],
    weight,
    symptoms: CANCER_SYMPTOMS,
    deadly: name,
    progress: 9,
    cancer: true,
    ...opts,
  }
}

export const DISEASES: DiseaseDef[] = [
  // Childhood
  { name: 'Croup', kind: 'disease', sev: [8, 15], tier: 1, cure: 0.85, self: 0.7, ages: [0, 6], weight: 4, symptoms: ["You've had a barking cough that sounds like a seal with a grudge."] },
  { name: 'Chicken Pox', kind: 'disease', sev: [8, 14], tier: 1, cure: 0.9, self: 0.85, ages: [1, 12], weight: 5, obvious: true, symptoms: ["You've broken out in itchy red spots from head to toe."] },
  { name: 'Measles', kind: 'disease', sev: [20, 35], tier: 2, cure: 0.85, self: 0.1, ages: [0, 12], weight: 0.5, deadly: 'Measles', progress: 12, symptoms: ['You noticed white spots inside your mouth and a rash spreading across your face.'] },
  { name: 'Mumps', kind: 'disease', sev: [10, 18], tier: 1, cure: 0.8, self: 0.5, ages: [1, 12], weight: 1.5, symptoms: ['Your cheeks are so swollen you look like a hamster hoarding snacks.'] },
  { name: 'Whooping Cough', kind: 'disease', sev: [20, 35], tier: 2, cure: 0.85, self: 0.15, ages: [0, 15], weight: 0.5, deadly: 'Whooping Cough', progress: 12, symptoms: ["You've been coughing so hard you make a whooping sound every time you breathe in."] },
  { name: 'Scarlet Fever', kind: 'disease', sev: [20, 35], tier: 2, cure: 0.8, self: 0.15, ages: [3, 15], weight: 0.5, deadly: 'Scarlet Fever', progress: 12, symptoms: ["You've got a sandpaper-like rash and a raging fever."] },
  { name: 'Middle Ear Infection', kind: 'disease', sev: [6, 12], tier: 1, cure: 0.9, self: 0.6, ages: [0, 10], weight: 4, symptoms: ['Your ear has been throbbing for days.'] },
  { name: 'Lice', kind: 'disease', sev: [2, 4], tier: 1, cure: 0.95, self: 0.4, ages: [4, 14], weight: 3, obvious: true, symptoms: ['Your scalp has been unbelievably itchy lately.'] },
  { name: 'Lactose Intolerance', kind: 'disease', sev: [2, 4], tier: 1, cure: 0, self: 0, ages: [1, 12], weight: 1.5, symptoms: ['Every time you drink milk, your stomach stages a full-scale revolt.'] },
  { name: 'Sickle Cell Disease', kind: 'disease', sev: [15, 30], tier: 3, cure: 0.1, self: 0, ages: [0, 12], weight: 0.15, deadly: 'Sickle Cell Disease', progress: 3, symptoms: ["You've had sudden episodes of intense pain all over your body."] },
  { name: 'Epilepsy', kind: 'disease', sev: [10, 20], tier: 2, cure: 0.2, self: 0.02, ages: [0, 30], weight: 0.4, symptoms: ['You blanked out for a minute and woke up on the floor with everyone staring at you.'] },
  { name: 'Asthma', kind: 'disease', sev: [6, 12], tier: 2, cure: 0.3, self: 0.05, ages: [0, 40], weight: 1.5, alt: ['acupuncture'], symptoms: ["You've been wheezing and struggling to catch your breath after climbing stairs."] },
  { name: 'Acne', kind: 'disease', sev: [2, 5], tier: 1, cure: 0.5, self: 0.35, ages: [11, 25], weight: 3, obvious: true, looks: 3, symptoms: ['Your face has erupted like a volcano of pimples.'] },
  // Common, any age
  { name: 'Common Cold', kind: 'disease', sev: [3, 6], tier: 1, cure: 0.95, self: 0.9, ages: [0, 130], weight: 12, obvious: true, symptoms: ['Your nose has been running like a waterfall for days.'] },
  { name: 'Flu', kind: 'disease', sev: [6, 12], tier: 1, cure: 0.9, self: 0.8, ages: [0, 130], weight: 9, obvious: true, symptoms: ["You're buried under a pile of blankets, sweating and freezing at the same time."] },
  { name: 'Food Poisoning', kind: 'disease', sev: [5, 10], tier: 1, cure: 0.9, self: 0.9, ages: [2, 130], weight: 3, obvious: true, symptoms: ['Something you ate is fighting its way back out.'] },
  { name: 'Pink Eye', kind: 'disease', sev: [3, 6], tier: 1, cure: 0.95, self: 0.7, ages: [0, 130], weight: 3, obvious: true, symptoms: ['You woke up and your eyes were crusted shut.'] },
  { name: 'Bronchitis', kind: 'disease', sev: [8, 15], tier: 1, cure: 0.85, self: 0.5, ages: [0, 130], weight: 4, symptoms: ["You've been hacking up thick mucus all day."] },
  { name: 'Pneumonia', kind: 'disease', sev: [15, 25], tier: 2, cure: 0.85, self: 0.3, ages: [0, 130], weight: 2.5, symptoms: ['You have a high fever and every breath feels like sandpaper.'] },
  { name: 'Tonsillitis', kind: 'disease', sev: [6, 12], tier: 1, cure: 0.85, self: 0.5, ages: [3, 30], weight: 2.5, symptoms: ['Swallowing feels like gargling thumbtacks.'] },
  { name: 'Hay Fever', kind: 'disease', sev: [2, 5], tier: 1, cure: 0.4, self: 0.1, ages: [3, 130], weight: 3, obvious: true, alt: ['acupuncture'], symptoms: ["You've been sneezing all day."] },
  { name: 'Hives', kind: 'disease', sev: [3, 6], tier: 1, cure: 0.9, self: 0.6, ages: [0, 130], weight: 2, obvious: true, symptoms: ['You noticed itchy welts all over your body.'] },
  { name: 'Migraines', kind: 'disease', sev: [5, 10], tier: 1, cure: 0.5, self: 0.1, ages: [10, 130], weight: 3, alt: ['acupuncture'], symptoms: ['Your head has been pounding so hard it feels like it might explode.'] },
  { name: "Athlete's Foot", kind: 'disease', sev: [2, 4], tier: 1, cure: 0.95, self: 0.6, ages: [8, 130], weight: 2, obvious: true, symptoms: ["Your feet have been terribly itchy and you can't stop scratching them."] },
  { name: 'Ringworm', kind: 'disease', sev: [3, 5], tier: 1, cure: 0.95, self: 0.5, ages: [3, 130], weight: 1.5, symptoms: ['You noticed some red, ring-shaped spots on your skin.'] },
  { name: 'Kidney Stones', kind: 'disease', sev: [10, 18], tier: 2, cure: 0.8, self: 0.3, ages: [20, 130], weight: 1.5, alt: ['acupuncture'], symptoms: ['Peeing has started to feel like passing a gravel driveway.'] },
  { name: 'Appendicitis', kind: 'disease', sev: [25, 40], tier: 3, cure: 0.9, self: 0, ages: [5, 70], weight: 0.5, deadly: 'Appendicitis', progress: 25, symptoms: ["You've had sharp, stabbing pains in the lower right side of your stomach."] },
  { name: 'Ulcers', kind: 'disease', sev: [8, 14], tier: 2, cure: 0.8, self: 0.2, ages: [20, 130], weight: 1.5, symptoms: ['Your stomach has been burning after every meal.'] },
  { name: 'Gout', kind: 'disease', sev: [6, 12], tier: 1, cure: 0.5, self: 0.1, ages: [35, 130], weight: 1.5, alt: ['chiropractic', 'acupuncture'], symptoms: ['Your big toe is so swollen and painful even a bedsheet hurts.'] },
  { name: 'Bunions', kind: 'disease', sev: [2, 5], tier: 1, cure: 0.6, self: 0, ages: [30, 130], weight: 1.5, alt: ['chiropractic', 'acupuncture'], symptoms: ["There's a big bulging bump on your toe that seems to grow by the day."] },
  { name: 'Scoliosis', kind: 'disease', sev: [4, 8], tier: 2, cure: 0.3, self: 0.02, ages: [10, 20], weight: 1, alt: ['chiropractic'], symptoms: ['While sizing yourself up in the mirror, you noticed your shoulders are uneven.'] },
  { name: 'Hemorrhoids', kind: 'disease', sev: [3, 6], tier: 1, cure: 0.8, self: 0.3, ages: [25, 130], weight: 1.5, alt: ['acupuncture'], symptoms: ['Sitting down has become an exercise in bravery.'] },
  { name: 'Fibromyalgia', kind: 'disease', sev: [6, 12], tier: 2, cure: 0.2, self: 0.05, ages: [25, 130], weight: 0.8, alt: ['acupuncture', 'chiropractic'], symptoms: ['Your whole body aches and you feel tired no matter what you do.'] },
  { name: 'Lyme Disease', kind: 'disease', sev: [10, 20], tier: 2, cure: 0.8, self: 0.05, ages: [5, 130], weight: 0.6, symptoms: ['Your joints have been aching ever since that hike, and there was a weird bullseye rash.'] },
  { name: 'Shingles', kind: 'disease', sev: [8, 14], tier: 1, cure: 0.8, self: 0.5, ages: [50, 130], weight: 1.5, obvious: true, symptoms: ['A painful, blistering rash has wrapped itself around your side.'] },
  { name: 'Hepatitis A', kind: 'disease', sev: [8, 15], tier: 2, cure: 0.85, self: 0.5, ages: [2, 130], weight: 0.6, symptoms: ['You noticed an orange hue to your skin and the whites of your eyes.'] },
  { name: 'Hepatitis C', kind: 'disease', sev: [15, 25], tier: 3, cure: 0.5, self: 0, ages: [18, 130], weight: 0.4, deadly: 'Hepatitis C', progress: 5, symptoms: ["You've been losing weight and feeling drained for months."] },
  { name: 'Viral Meningitis', kind: 'disease', sev: [15, 25], tier: 2, cure: 0.85, self: 0.3, ages: [0, 130], weight: 0.5, symptoms: ['You have a stiff neck, a raging headache and bright lights hurt your eyes.'] },
  { name: 'Staph Infection', kind: 'disease', sev: [8, 15], tier: 2, cure: 0.85, self: 0.2, ages: [0, 130], weight: 1, symptoms: ['A red, swollen sore on your leg is getting worse instead of better.'] },
  { name: 'Tuberculosis', kind: 'disease', sev: [20, 35], tier: 3, cure: 0.75, self: 0.05, ages: [0, 130], weight: 0.4, deadly: 'Tuberculosis', progress: 8, symptoms: ["You've been coughing up blood and sweating through your sheets at night."] },
  { name: 'Malaria', kind: 'disease', sev: [20, 35], tier: 2, cure: 0.75, self: 0.05, ages: [0, 130], weight: 0.3, deadly: 'Malaria', progress: 15, symptoms: ['You have chills, a fever, and a suspicious number of mosquito bites.'] },
  { name: 'Bubonic Plague', kind: 'disease', sev: [30, 45], tier: 3, cure: 0.8, self: 0.02, ages: [0, 130], weight: 0.04, deadly: 'Bubonic Plague', progress: 20, symptoms: ['Your lymph nodes are painfully swollen and you feel positively medieval.'] },
  { name: 'Lupus', kind: 'disease', sev: [15, 25], tier: 3, cure: 0.15, self: 0, ages: [15, 50], weight: 0.4, deadly: 'Lupus', progress: 4, symptoms: ['A butterfly-shaped rash appeared across your cheeks and your joints ache.'] },
  { name: 'Multiple Sclerosis', kind: 'disease', sev: [10, 20], tier: 3, cure: 0.05, self: 0, ages: [20, 50], weight: 0.4, progress: 3, symptoms: ['Your hands have been tingling and you keep losing your balance.'] },
  { name: 'Diabetes', kind: 'disease', sev: [8, 16], tier: 2, cure: 0, self: 0, ages: [10, 130], weight: 0.7, deadly: 'Diabetes', progress: 1, symptoms: ["You're constantly thirsty and you've been peeing every fifteen minutes."] },
  { name: 'Sleep Apnea', kind: 'disease', sev: [6, 12], tier: 2, cure: 0.7, self: 0.05, ages: [30, 130], weight: 1, symptoms: ["You've been told you stop breathing several times a night while you sleep."] },
  { name: 'Heart Disease', kind: 'disease', sev: [20, 35], tier: 3, cure: 0.4, self: 0, ages: [35, 130], weight: 1.2, deadly: 'Heart Attack', progress: 6, symptoms: ['You felt a stabbing pain in your chest while walking up a hill.', 'Your hands and feet have gone numb a few times this week.'] },
  { name: 'High Blood Pressure', kind: 'disease', sev: [8, 15], tier: 2, cure: 0.35, self: 0.05, ages: [30, 130], weight: 2.5, alt: ['acupuncture'], deadly: 'Stroke', progress: 3, symptoms: ["You've had blurry vision and a pounding headache whenever you get stressed."] },
  // Cancers
  cancer('Lung Cancer', 1.2, 0.25),
  cancer('Pancreatic Cancer', 0.6, 0.12),
  cancer('Breast Cancer', 1, 0.4, { gender: 'female' }),
  cancer('Prostate Cancer', 1, 0.45, { gender: 'male', ages: [45, 130] }),
  cancer('Ovarian Cancer', 0.5, 0.3, { gender: 'female' }),
  cancer('Testicular Cancer', 0.4, 0.55, { gender: 'male', ages: [15, 50] }),
  cancer('Skin Cancer', 1, 0.6),
  cancer('Brain Cancer', 0.4, 0.15, { ages: [0, 130] }),
  cancer('Liver Cancer', 0.5, 0.2),
  cancer('Kidney Cancer', 0.4, 0.35),
  cancer('Stomach Cancer', 0.5, 0.3),
  cancer('Thyroid Cancer', 0.5, 0.6),
  cancer('Colon Cancer', 0.9, 0.35, { alt: ['colon'] }),
  cancer('Bone Cancer', 0.3, 0.3, { ages: [0, 130] }),
  cancer('Leukemia', 0.5, 0.35, { ages: [0, 130] }),
  cancer('Mouth Cancer', 0.3, 0.4),
  cancer('Gallbladder Cancer', 0.2, 0.25),
  cancer('Eyebrow Cancer', 0.08, 0.4, { odd: true }),
  cancer('Eyeball Cancer', 0.08, 0.35),
  cancer('Scalp Cancer', 0.08, 0.45),
  cancer("Adam's Apple Cancer", 0.06, 0.35, { gender: 'male' }),
  cancer('Buttocks Cancer', 0.06, 0.4, { odd: true }),
  // Aging
  { name: 'Arthritis', kind: 'disease', sev: [5, 10], tier: 1, cure: 0.3, self: 0.02, ages: [50, 130], weight: 3, alt: ['chiropractic', 'acupuncture'], symptoms: ['Your joints have been stiff and sore every morning.'] },
  { name: 'Hearing Loss', kind: 'disease', sev: [2, 4], tier: 2, cure: 0.3, self: 0, ages: [55, 130], weight: 3, obvious: true, symptoms: ['You keep asking people to speak up.'] },
  { name: 'Hair Loss', kind: 'disease', sev: [1, 2], tier: 2, cure: 0.2, self: 0, ages: [25, 130], weight: 2, gender: 'male', obvious: true, looks: 3, symptoms: ['You discovered a significant bald spot on your head.'] },
  { name: 'Osteoporosis', kind: 'disease', sev: [6, 10], tier: 2, cure: 0.3, self: 0, ages: [60, 130], weight: 1.5, symptoms: ['Your back has been aching and you seem to have gotten shorter.'] },
  { name: 'Cataracts', kind: 'disease', sev: [3, 6], tier: 2, cure: 0.9, self: 0, ages: [60, 130], weight: 2, symptoms: ['Your vision has gone cloudy, like looking through a dirty window.'] },
  { name: 'Dementia', kind: 'disease', sev: [10, 18], tier: 3, cure: 0.05, self: 0, ages: [70, 130], weight: 2, deadly: 'Dementia', progress: 4, smarts: 4, symptoms: ['You were walking to the store and suddenly forgot where you were going.'] },
  { name: "Alzheimer's Disease", kind: 'disease', sev: [15, 25], tier: 3, cure: 0.05, self: 0, ages: [65, 130], weight: 1.5, deadly: "Alzheimer's Disease", progress: 5, smarts: 6, symptoms: ['You have found yourself strangely confused in several situations lately.'] },
  { name: "Parkinson's Disease", kind: 'disease', sev: [12, 20], tier: 3, cure: 0.05, self: 0, ages: [60, 130], weight: 1, deadly: "Parkinson's Disease", progress: 4, symptoms: ["Your hands have developed a tremor that won't go away."] },
  // Mental
  { name: 'Depression', kind: 'mental', sev: [10, 20], tier: 2, cure: 0.35, self: 0.1, ages: [10, 130], weight: 1.5, alt: ['acupuncture'], mood: 6, symptoms: ["You haven't wanted to get out of bed for weeks. Nothing seems fun anymore."] },
  { name: 'Anxiety', kind: 'mental', sev: [8, 15], tier: 2, cure: 0.4, self: 0.15, ages: [8, 130], weight: 2, alt: ['acupuncture'], mood: 4, symptoms: ['Your heart races and your palms sweat over the smallest things.'] },
  { name: 'Insomnia', kind: 'mental', sev: [5, 10], tier: 1, cure: 0.4, self: 0.2, ages: [12, 130], weight: 2.5, alt: ['acupuncture'], mood: 2, symptoms: ["You just woke up in the middle of the night for the sixth time. Sleep is a distant memory."] },
  { name: 'Bipolar Disorder', kind: 'mental', sev: [10, 15], tier: 2, cure: 0.2, self: 0, ages: [15, 130], weight: 0.4, mood: 5, symptoms: ['Your mood has been a roller coaster, swinging wildly up and down.'] },
  { name: 'Schizophrenia', kind: 'mental', sev: [12, 20], tier: 3, cure: 0.1, self: 0, ages: [16, 35], weight: 0.2, mood: 5, smarts: 2, symptoms: ['Your friends think you are delusional after you insisted the TV was talking to you.'] },
  { name: 'Anorexia', kind: 'mental', sev: [12, 20], tier: 2, cure: 0.3, self: 0.05, ages: [12, 30], weight: 0.25, deadly: 'Anorexia', progress: 3, mood: 4, symptoms: ["You've been skipping meals and you've become frighteningly thin."] },
  { name: 'Bulimia', kind: 'mental', sev: [10, 18], tier: 2, cure: 0.3, self: 0.05, ages: [12, 30], weight: 0.2, mood: 4, symptoms: ["You've been secretly throwing up after meals."] },
  // Odd
  { name: 'Walking Corpse Syndrome', kind: 'mental', sev: [5, 10], tier: 2, cure: 0.2, self: 0.1, ages: [16, 130], weight: 0.1, odd: true, mood: 4, symptoms: ["You've become convinced that you are already dead. It's very inconvenient."] },
  { name: 'Alien Hand Syndrome', kind: 'disease', sev: [3, 6], tier: 2, cure: 0.1, self: 0.05, ages: [16, 130], weight: 0.1, odd: true, symptoms: ['Your left hand keeps doing things without asking you first. It slapped a waiter yesterday.'] },
  { name: 'Foreign Accent Syndrome', kind: 'disease', sev: [1, 3], tier: 2, cure: 0.2, self: 0.2, ages: [10, 130], weight: 0.1, odd: true, obvious: true, symptoms: ['People keep asking where your new accent is from. You have no idea.'] },
  { name: 'Werewolf Syndrome', kind: 'disease', sev: [1, 3], tier: 2, cure: 0.1, self: 0, ages: [5, 130], weight: 0.08, odd: true, obvious: true, looks: 4, symptoms: ["You've started growing thick hair all over your body. Full moons make you nervous."] },
  { name: 'Fish Odor Syndrome', kind: 'disease', sev: [1, 3], tier: 2, cure: 0.1, self: 0, ages: [5, 130], weight: 0.1, odd: true, mood: 2, symptoms: ['You smell like a fish market and showering does nothing.'] },
  { name: 'Narcolepsy', kind: 'disease', sev: [5, 10], tier: 2, cure: 0.2, self: 0, ages: [10, 130], weight: 0.2, odd: true, symptoms: ['You fell asleep mid-sentence. Twice. Today.'] },
  // Intimate infections (only when the character has had partners)
  { name: 'Chlamydia', kind: 'std', sev: [5, 10], tier: 1, cure: 0.9, self: 0.1, ages: [16, 130], weight: 1, sti: true, symptoms: ["You've noticed a burning sensation when you pee."] },
  { name: 'Gonorrhea', kind: 'std', sev: [6, 12], tier: 1, cure: 0.85, self: 0.05, ages: [16, 130], weight: 0.8, sti: true, symptoms: ['It burns when you pee and you feel feverish.'] },
  { name: 'Herpes', kind: 'std', sev: [4, 8], tier: 2, cure: 0.1, self: 0, ages: [16, 130], weight: 0.6, sti: true, symptoms: ['You discovered some painful blisters in a very private place.'] },
  { name: 'HPV', kind: 'std', sev: [4, 10], tier: 2, cure: 0.3, self: 0.25, ages: [16, 130], weight: 0.5, sti: true, symptoms: ['You noticed some strange bumps in a place you would rather not discuss.'] },
  { name: 'Crabs', kind: 'std', sev: [2, 5], tier: 1, cure: 0.95, self: 0.2, ages: [16, 130], weight: 0.4, sti: true, symptoms: ["You've been itching like crazy somewhere very private."] },
  { name: 'Syphilis', kind: 'std', sev: [10, 18], tier: 2, cure: 0.85, self: 0, ages: [16, 130], weight: 0.4, sti: true, progress: 4, symptoms: ['A painless sore appeared, followed by a rash on your palms.'] },
  { name: 'HIV', kind: 'std', sev: [15, 25], tier: 4, cure: 0.02, self: 0, ages: [16, 130], weight: 0.15, sti: true, deadly: 'HIV', progress: 3, symptoms: ["You've had a fever and swollen glands that just won't quit."] },
  { name: 'Hepatitis B', kind: 'std', sev: [10, 20], tier: 3, cure: 0.3, self: 0.05, ages: [16, 130], weight: 0.3, sti: true, deadly: 'Hepatitis B', progress: 3, symptoms: ["Your skin has taken on a yellowish tint and you're always tired."] },
  // Illnesses of the past (history/events-medicine.ts): weight 0 here, only rolled in the years
  // they were around, and the great pandemics only through their era popups (events/history.ts).
  { name: 'Polio', kind: 'disease', sev: [15, 35], tier: 3, cure: 0.3, self: 0.4, ages: [1, 30], weight: 0, deadly: 'Polio', progress: 6, symptoms: ['You woke up with a fever, a stiff neck and legs that feel strangely weak.'] },
  { name: 'Smallpox', kind: 'disease', sev: [25, 40], tier: 3, cure: 0.3, self: 0.5, ages: [0, 130], weight: 0, obvious: true, deadly: 'Smallpox', progress: 10, looks: 6, symptoms: ['A high fever was followed by a rash of blisters spreading across your face and hands.'] },
  { name: 'Diphtheria', kind: 'disease', sev: [20, 35], tier: 2, cure: 0.8, self: 0.3, ages: [0, 15], weight: 0, deadly: 'Diphtheria', progress: 12, symptoms: ['Your throat is so swollen and gray that it hurts to breathe.'] },
  { name: 'Typhoid Fever', kind: 'disease', sev: [18, 32], tier: 2, cure: 0.8, self: 0.35, ages: [2, 130], weight: 0, deadly: 'Typhoid Fever', progress: 10, symptoms: ['A fever has been climbing for days and you broke out in rose-colored spots.'] },
  { name: 'Cholera', kind: 'disease', sev: [20, 35], tier: 2, cure: 0.85, self: 0.4, ages: [0, 130], weight: 0, obvious: true, deadly: 'Cholera', progress: 15, symptoms: ['You have been violently ill since drinking water from the pump.'] },
  { name: 'Pandemic Influenza', kind: 'disease', sev: [15, 35], tier: 2, cure: 0.5, self: 0.6, ages: [0, 130], weight: 0, obvious: true, deadly: 'Pandemic Influenza', progress: 12, symptoms: ['A fever hit you like a train, and your lips have turned a frightening shade of blue.'] },
  { name: 'Novel Coronavirus', kind: 'disease', sev: [5, 15], tier: 2, cure: 0.85, self: 0.75, ages: [0, 130], weight: 0, obvious: true, deadly: 'Novel Coronavirus', progress: 6, symptoms: ["You've lost your sense of taste and smell, and you can't stop coughing."] },
]

/** Catalog illnesses that only exist in historical years (rolled with their era weight). */
const ERA_ONLY = new Set(['Polio', 'Smallpox', 'Diphtheria', 'Typhoid Fever', 'Cholera', 'Pandemic Influenza', 'Novel Coronavirus'])

const DEF_BY_NAME = new Map(DISEASES.map((d) => [d.name.toLowerCase(), d]))

export function getDiseaseDef(name: string): DiseaseDef | undefined {
  return DEF_BY_NAME.get(name.trim().toLowerCase())
}

/** Definition for any condition, including ones named by event outcomes, other modules or older saves. */
function defFor(cond: Condition): DiseaseDef {
  const known = getDiseaseDef(cond.name)
  if (known) return known
  const sev = cond.severity
  const base: DiseaseDef = {
    name: cond.name,
    kind: cond.kind,
    sev: [sev, sev],
    tier: sev >= 50 ? 4 : sev >= 30 ? 3 : sev >= 12 ? 2 : 1,
    cure: cond.curable ? Math.max(0.2, 0.9 - sev / 120) : 0.05,
    self: sev < 15 ? 0.5 : sev < 30 ? 0.2 : 0.03,
    ages: [0, 130],
    weight: 0,
    symptoms: ["You haven't been feeling like yourself lately."],
    deadly: sev >= 30 ? cond.name : undefined,
  }
  if (cond.kind === 'injury') return { ...base, cure: Math.max(0.6, base.cure), self: 0.55, deadly: sev >= 40 ? 'Complications From Injuries' : undefined }
  if (cond.kind === 'mental') return { ...base, cure: 0.35, self: 0.12, mood: 4, deadly: undefined }
  if (cond.kind === 'std') return { ...base, self: 0.05 }
  if (cond.kind === 'addiction') return { ...base, cure: 0, self: 0, deadly: undefined }
  if (/cancer|leukemia|tumou?r/i.test(cond.name)) return { ...base, tier: 4, cure: 0.3, self: 0, deadly: cond.name, progress: 9, cancer: true }
  return base
}

// ---------------------------------------------------------------------------
// Small helpers

const KEEP_CASE = /^(HIV|PTSD|AIDS|[A-Z]|[A-Z][a-z]+'s|Lyme|E\.)$/

/** "Common Cold" -> "common cold", but "Alzheimer's Disease" -> "Alzheimer's disease". */
export function conditionLabel(name: string): string {
  return name
    .split(' ')
    .map((w) => (KEEP_CASE.test(w) ? w : w.toLowerCase()))
    .join(' ')
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
}

/**
 * Pick a line for something that recurs year after year, never the same one twice in a row.
 * Remembers the last index in g.flags under `line.<key>`.
 */
function freshLine(g: GameState, key: string, lines: string[]): string {
  const flag = `line.${key}`
  // Remember the last few picks (not just the last one) so the same line doesn't come back
  // two or three years later.
  const raw = g.flags[flag]
  const recent = Array.isArray(raw) ? raw.filter((x): x is number => typeof x === 'number') : typeof raw === 'number' ? [raw] : []
  const keep = Math.max(0, Math.min(lines.length - 1, 3))
  const options = lines.map((_, i) => i).filter((i) => !recent.slice(-keep).includes(i))
  const i = pick(g, options.length ? options : lines.map((_, j) => j))
  g.flags[flag] = [...recent, i].slice(-Math.max(1, keep))
  return lines[i]
}

/** Years since an unprompted event last fired (large when never). */
function yearsSince(g: GameState, flag: string): number {
  const last = g.flags[flag]
  return typeof last === 'number' ? g.character.age - last : 99
}

/** Deterministic hash, used to keep menu contents stable while browsing (no RNG in menus). */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function priceFactor(g: GameState): number {
  return Math.max(0.3, getCountry(g.character.countryId).wealth)
}

type Coverage = 'prison' | 'parents' | 'public' | 'insured' | 'none'

function coverage(g: GameState): Coverage {
  if (inPrison(g)) return 'prison'
  if (g.character.age < 18) return 'parents'
  if (getCountry(g.character.countryId).universalHealthcare) return 'public'
  if (g.flags.healthInsurance === true) return 'insured'
  return 'none'
}

/** What the patient actually pays for a service with this list price. */
function patientCost(g: GameState, listPrice: number, publicCovered = true): number {
  const cov = coverage(g)
  if (cov === 'prison' || cov === 'parents') return 0
  if (cov === 'public' && publicCovered) return 0
  if (cov === 'insured') return Math.round(listPrice * 0.2)
  return Math.round(listPrice)
}

function priceLabel(g: GameState, cost: number): string {
  if (cost > 0) return formatMoney(cost)
  const cov = coverage(g)
  if (cov === 'parents') return 'Paid by your parents'
  if (cov === 'prison') return 'Free'
  if (cov === 'public') return 'Free (public healthcare)'
  return 'Free'
}

function aliveParent(g: GameState): Person | undefined {
  const ps = parents(g).filter((p) => p.relation === 'parent')
  return ps.find((p) => p.gender === 'female') ?? ps[0] ?? parents(g)[0]
}

function parentWord(p: Person | undefined): string {
  if (!p) return 'guardian'
  if (p.relation === 'stepparent') return p.gender === 'male' ? 'stepfather' : 'stepmother'
  return p.gender === 'male' ? 'father' : 'mother'
}

function tooBroke(g: GameState, what: string, cost: number): void {
  notice(
    g,
    "Can't Afford It",
    pick(g, [
      `You can't afford ${what}. It costs ${formatMoney(cost)} and your bank account just laughed at you.`,
      `${cap(what)} costs ${formatMoney(cost)}. You don't have that kind of money.`,
      `You're ${formatMoney(cost - g.character.money)} short for ${what}.`,
    ]),
    { emoji: '\u{1F4B8}', tone: 'bad' },
  )
}

function aliveCheck(g: GameState): string | null {
  return g.character.alive ? null : "You're dead."
}

function adultOnly(what: string) {
  return (g: GameState): string | null => {
    if (!g.character.alive) return "You're dead."
    if (g.character.age < 18) return `You must be at least 18 to ${what}.`
    return null
  }
}

// ---------------------------------------------------------------------------
// Conditions

/** Give the player a condition from the catalog (or a custom one). Returns null if they already have it. */
export function contractCondition(
  g: GameState,
  name: string,
  opts: { kind?: ConditionKind; severity?: number; diagnosed?: boolean; quiet?: boolean } = {},
): Condition | null {
  const c = g.character
  if (c.conditions.some((x) => x.name.toLowerCase() === name.toLowerCase())) return null
  const def = getDiseaseDef(name)
  const kind = opts.kind ?? def?.kind ?? 'disease'
  const severity = Math.max(1, Math.min(100, Math.round(opts.severity ?? (def ? randInt(g, def.sev[0], def.sev[1]) : 15))))
  const cond: Condition = {
    id: uid(g, 'c'),
    name: def?.name ?? name,
    kind,
    severity,
    yearsHad: 0,
    curable: def ? def.cure > 0 : kind !== 'addiction',
    diagnosed: opts.diagnosed ?? (def?.obvious === true || kind === 'injury' || kind === 'addiction'),
    age: c.age,
  }
  c.conditions.push(cond)
  if (kind !== 'addiction') count(g, 'diseases')
  if (!opts.quiet) announceCondition(g, cond)
  return cond
}

function announceCondition(g: GameState, cond: Condition): void {
  const def = defFor(cond)
  const label = conditionLabel(cond.name)
  const symptom = cond.name === 'Schizophrenia' && !hasTech(g, 'tv')
    ? 'You have been hearing voices that nobody else can hear.'
    : pick(g, def.symptoms)
  if (cond.diagnosed) {
    if (cond.severity < 15) {
      log(g, fill(freshLine(g, 'caught', ['I came down with {name}.', 'I caught {name}.', "I've been dealing with {name}.", 'I spent a miserable week with {name}.']), { name: label }), 'bad')
    } else {
      notice(g, cap(label), `${symptom} You've come down with ${label}.`, { emoji: '\u{1F912}', tone: 'bad' })
      log(g, `I came down with ${label}.`, 'bad')
    }
    return
  }
  if (cond.severity < 15 || g.character.age < 4) {
    log(g, freshLine(g, 'underWeather', ["I've been feeling a bit under the weather.", "I haven't been feeling like myself lately.", "Something's been off with my health.", "I've been dragging myself through the days.", "My body has been sending me strongly worded complaints."]), 'bad')
    return
  }
  // Before the internet, people looked their symptoms up in a book (or asked Grandma).
  const web: ChoiceOption = noInternetYet(g) ? { id: 'web', label: 'Look it up in a medical book', emoji: '\u{1F4D6}' } : { id: 'web', label: 'Search the internet', emoji: '\u{1F4BB}' }
  const choices: ChoiceOption[] =
    g.character.age < 18
      ? [{ id: 'doctor', label: 'Tell my parents', emoji: '\u{1FA7A}' }, web, { id: 'ignore', label: 'Ignore it', emoji: '\u{1F648}' }]
      : [{ id: 'doctor', label: 'Visit the doctor', emoji: '\u{1FA7A}' }, web, { id: 'ignore', label: 'Ignore it', emoji: '\u{1F648}' }]
  scriptChoice(g, SYMPTOMS, 'Symptoms', `You've been feeling sick lately… ${symptom}`, choices, {
    emoji: '\u{1F915}',
    data: { conditionId: cond.id },
  })
}

/** A historical year with no internet here yet (modern years always have it). */
function noInternetYet(g: GameState): boolean {
  return isHistorical(g.year) && !hasTech(g, 'internet')
}

function removeCondition(g: GameState, id: string): void {
  g.character.conditions = g.character.conditions.filter((x) => x.id !== id)
}

function treatableNonAddiction(g: GameState): Condition[] {
  return g.character.conditions.filter((x) => x.kind !== 'addiction')
}

/** Yearly chance of getting sick at all. */
function sicknessChance(g: GameState): number {
  const c = g.character
  const a = c.age
  let p = a < 5 ? 0.2 : a < 18 ? 0.14 : a < 50 ? 0.11 : a < 70 ? 0.16 : 0.22
  if (c.stats.health < 50) p += (50 - c.stats.health) * 0.004
  if (c.hidden.karma < 25) p += 0.03
  if (inPrison(g)) p += 0.04
  // Before modern medicine, infections were everywhere (0 from PRESENT_YEAR on).
  if (isHistorical(g.year)) p += eraSicknessBoost(c.countryId, g.year, a)
  return Math.min(0.45, p)
}

function ageWeight(def: DiseaseDef, age: number): number {
  if (def.cancer) return age < 18 ? 0.04 : age < 40 ? 0.12 : age < 60 ? 0.5 : 1.1
  if (def.name === 'Heart Disease' || def.name === 'High Blood Pressure') return age < 50 ? 0.35 : age < 70 ? 1.3 : 1.8
  if (def.name === 'Pneumonia') return age >= 70 ? 2 : 1
  return 1
}

function eligibleDiseases(g: GameState): DiseaseDef[] {
  const c = g.character
  const hadPartners = (g.counters.hookups ?? 0) + (g.counters.partners ?? 0) + (g.counters.marriages ?? 0) > 0
  return DISEASES.filter((d) => {
    if (c.age < d.ages[0] || c.age > d.ages[1]) return false
    if (d.gender && d.gender !== c.gender) return false
    if (d.sti && (!hadPartners || c.age < 16)) return false
    if (ERA_ONLY.has(d.name) && eraOnlyWeight(g, d.name) <= 0) return false
    return !c.conditions.some((x) => x.name === d.name)
  })
}

/** Weight of an illness of the past this year (0 in modern years and once vaccinated). */
function eraOnlyWeight(g: GameState, name: string): number {
  if (!isHistorical(g.year)) return 0
  if (name === 'Polio' && g.flags['history.polioVaccinated'] === true) return 0
  const era = ERA_DISEASES.find((d) => d.name === name)
  return era ? era.weight(g.character.countryId, g.year) : 0
}

function diseaseWeight(g: GameState, d: DiseaseDef): number {
  const c = g.character
  if (ERA_ONLY.has(d.name)) return eraOnlyWeight(g, d.name) * ageWeight(d, c.age)
  let w = d.weight * ageWeight(d, c.age)
  // Vaccines and discoveries changed what people caught (exactly 1 in modern years).
  if (isHistorical(g.year)) w *= eraDiseaseWeight(c.countryId, g.year, d.name)
  const idle = c.age > 25 && Object.values(g.counters).reduce((s, n) => s + n, 0) < 10
  if (d.odd && idle) w *= 3
  // Mosquito- and tick-borne illnesses follow the climate: no malaria in Norway, no Lyme in the Sahara.
  const climate = localeOf(c.countryId).climate
  if (d.name === 'Malaria' && climate !== 'tropical' && !(climate === 'arid' && getCountry(c.countryId).wealth < 0.3)) return 0
  if (d.name === 'Lyme Disease' && (climate === 'tropical' || climate === 'arid')) return 0
  if (d.name === 'Malaria' || d.name === 'Tuberculosis') {
    // Tropical and poverty-linked illnesses are rare in rich countries.
    const wealth = getCountry(c.countryId).wealth
    if (wealth < 0.3) w *= 2
    else if (wealth >= 0.6) w *= d.name === 'Malaria' ? 0 : 0.3
    else if (d.name === 'Malaria') w *= 0.5
  }
  if ((d.name === 'Anorexia' || d.name === 'Bulimia') && c.gender === 'female') w *= 3
  if (d.name === 'Diabetes' && c.stats.health < 50) w *= 1.8
  if (d.name === 'Depression' && c.stats.happiness < 40) w *= 3
  if (d.name === 'Anxiety' && c.stats.happiness < 40) w *= 2
  return w
}

function maybeContract(g: GameState): void {
  const c = g.character
  const active = treatableNonAddiction(g)
  // Low happiness breeds depression and anxiety.
  if (c.age >= 10 && c.stats.happiness < 15 && !c.conditions.some((x) => x.name === 'Depression') && chance(g, 0.4)) {
    contractCondition(g, 'Depression')
    return
  }
  if (c.age >= 8 && c.stats.happiness < 30 && !c.conditions.some((x) => x.name === 'Anxiety') && chance(g, 0.08)) {
    contractCondition(g, 'Anxiety')
    return
  }
  if (active.length >= 5) return
  if (!chance(g, sicknessChance(g))) return
  const pool = eligibleDiseases(g)
  if (pool.length === 0) return
  const def = weightedPick(g, pool, (d) => diseaseWeight(g, d))
  contractCondition(g, def.name)
}

/** Incurable, lifelong illnesses that can only be managed (not cancers). */
function isChronic(def: DiseaseDef): boolean {
  return !def.cancer && def.self === 0 && def.cure < 0.2
}

const RESOLVED_LINES = ['My {name} cleared up on its own.', 'I finally got over my {name}.', 'My {name} went away by itself.', 'I beat my {name} without seeing a doctor.']
const RESOLVED_HIDDEN = ["I've been feeling a lot better lately.", 'Whatever was making me sick went away on its own.', 'I finally shook off whatever bug I had.', 'My body sorted itself out without any help from me.', 'I woke up one day and felt like myself again.', 'Whatever I had packed its bags and left.']

/**
 * Before streptomycin, tuberculosis was treated with the rest cure: months in a sanatorium on a
 * hill, fresh air, bed and good food, which slowed the disease at the price of isolation. 1 means
 * no rest cure; below 1 it scales the year's damage. Not behind bars, not in countries too poor to
 * have sanatoria, and never once effective antibiotics reached the country.
 */
function restCureFactor(g: GameState, cond: Condition): number {
  const c = g.character
  if (cond.name !== 'Tuberculosis' || !cond.diagnosed || !isHistorical(g.year) || inPrison(g)) return 1
  if (medicalYear(c.countryId, g.year) >= 1955 || getCountry(c.countryId).wealth < 0.3) return 1
  const key = `sanatorium.${cond.id}`
  if (!g.flags[key]) {
    g.flags[key] = true
    log(g, 'I was sent to a sanatorium in the hills for the rest cure: fresh air, bed rest and a great deal of boredom.', 'bad')
  }
  addStat(g, 'happiness', -3)
  return 0.5
}

function progressConditions(g: GameState): void {
  const c = g.character
  for (const cond of [...c.conditions]) {
    if (cond.kind === 'addiction') continue
    const def = defFor(cond)
    cond.yearsHad += 1
    // Mental conditions lift when life is going well.
    let selfChance = def.self
    if (cond.kind === 'mental' && c.stats.happiness >= 75) selfChance = Math.max(selfChance, 0.4)
    if (cond.kind === 'injury') selfChance = Math.max(selfChance, cond.severity < 30 ? 0.6 : 0.3)
    if (selfChance > 0 && chance(g, selfChance)) {
      removeCondition(g, cond.id)
      log(g, cond.diagnosed ? fill(freshLine(g, 'resolved', RESOLVED_LINES), { name: conditionLabel(cond.name) }) : freshLine(g, 'resolvedHidden', RESOLVED_HIDDEN), 'good')
      continue
    }
    const jitter = randFloat(g, 0.7, 1.3) * restCureFactor(g, cond)
    // Lifelong illnesses (diabetes, lupus, HIV...) wear you down slowly instead of
    // killing within a few years like an untreated cancer.
    const chronic = isChronic(def)
    if (cond.kind === 'mental') {
      addStat(g, 'health', -Math.round(cond.severity * 0.12 * jitter))
      addStat(g, 'happiness', -Math.round((cond.severity * 0.4 + (def.mood ?? 3)) * jitter))
    } else {
      addStat(g, 'health', -Math.round(cond.severity * (def.deadly && !chronic ? 0.38 : 0.22) * jitter))
      if (cond.diagnosed && def.deadly) addStat(g, 'happiness', -randInt(g, 2, 6))
      if (def.mood) addStat(g, 'happiness', -def.mood)
    }
    if (def.looks) addStat(g, 'looks', -randInt(g, 1, def.looks))
    if (def.smarts) addStat(g, 'smarts', -randInt(g, 1, def.smarts))
    if (def.progress) {
      const p = def.progress
      const ceiling = chronic ? Math.max(cond.severity, def.sev[1] + 15) : 100
      cond.severity = Math.min(ceiling, cond.severity + randInt(g, Math.max(1, Math.round(p * 0.5)), Math.round(p * 1.5)))
    }
  }
}

// ---------------------------------------------------------------------------
// Addictions

type AddictionKind = 'alcohol' | 'drug' | 'gambling' | 'nicotine' | 'other'

function addictionKind(name: string): AddictionKind {
  if (/alcohol|booze|drink|beer|wine|vodka|whisk|liquor|tequila|rum\b|gin\b/i.test(name)) return 'alcohol'
  if (/gambl|casino|betting|poker|slot/i.test(name)) return 'gambling'
  if (/smok|nicotine|cigar|vap|tobacco/i.test(name)) return 'nicotine'
  if (/shop|video ?game|gaming|social media|food|sugar|caffeine|coffee/i.test(name)) return 'other'
  return 'drug'
}

function addictionSubject(name: string): string {
  const s = name.replace(/\s*addiction\s*/i, ' ').trim().toLowerCase()
  if (s === 'drug') return 'drugs'
  return s || 'it'
}

function strList(v: Json | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** Notice addictions that disappeared (rehab, meetings) so they can relapse later. */
function trackRecovery(g: GameState): void {
  const current = g.character.conditions.filter((x) => x.kind === 'addiction').map((x) => x.name)
  const known = strList(g.flags.knownAddictions)
  const recovered = strList(g.flags.recoveredAddictions)
  for (const name of known) {
    if (!current.includes(name) && !recovered.includes(name)) recovered.push(name)
  }
  g.flags.recoveredAddictions = recovered.filter((n) => !current.includes(n))
  g.flags.knownAddictions = current
}

function processAddictions(g: GameState): void {
  const c = g.character
  const addictions = c.conditions.filter((x) => x.kind === 'addiction')
  for (const a of addictions) {
    a.yearsHad += 1
    const kind = addictionKind(a.name)
    const s = a.severity
    switch (kind) {
      case 'alcohol':
        addStat(g, 'health', -Math.round(3 + s * 0.15))
        addStat(g, 'happiness', -randInt(g, 2, 5))
        addStat(g, 'looks', -randInt(g, 0, 2))
        break
      case 'drug':
        addStat(g, 'health', -Math.round(4 + s * 0.2))
        addStat(g, 'happiness', -randInt(g, 3, 7))
        addStat(g, 'looks', -randInt(g, 1, 3))
        addStat(g, 'smarts', -randInt(g, 0, 2))
        break
      case 'gambling':
        addStat(g, 'happiness', -randInt(g, 4, 8))
        break
      case 'nicotine':
        addStat(g, 'health', -Math.round(2 + s * 0.08))
        addStat(g, 'looks', -randInt(g, 0, 1))
        break
      default:
        addStat(g, 'happiness', -randInt(g, 1, 4))
        addStat(g, 'health', -randInt(g, 0, 2))
    }
  }
  if (addictions.length === 0 || inPrison(g) || c.age < 12) return
  // Cravings nag, but not every single birthday: at most every other year.
  if (yearsSince(g, 'cravingAge') < 2 || !chance(g, 0.5)) return
  g.flags.cravingAge = c.age
  const worst = [...addictions].sort((a, b) => b.severity - a.severity)[0]
  const kind = addictionKind(worst.name)
  const subject = addictionSubject(worst.name)
  // Where alcohol is banned there is no bar on the corner, only a guy who knows a guy.
  const barsLegal = isIndustryLegal(c.countryId, 'bar')
  const lines: Record<AddictionKind, string[]> = {
    alcohol: barsLegal
      ? [
          "You've been thinking about a cold drink all week. Your hands are a little shaky.",
          "It's been a long day and the bar on the corner is calling your name.",
          'Your friends are going out for drinks. "Just one," you tell yourself.',
        ]
      : [
          "You've been thinking about a drink all week. Your hands are a little shaky.",
          '@texting You know a guy who knows a guy who can get you a bottle, strictly off the books. He just texted.',
          '@!texting You know a guy who knows a guy who can get you a bottle, strictly off the books. He just left word with a neighbor.',
          'Someone at a private party whispered that there is "something stronger" in the back room.',
        ],
    drug: [
      `@texting Your body is screaming for ${subject}. Your old supplier just texted "u up?"`,
      `@!texting Your body is screaming for ${subject}. Your old supplier is waiting at the usual corner.`,
      `You can't stop thinking about ${subject}. Everything feels gray without it.`,
      `Someone at a party slipped you their number and said they can get ${subject}.`,
    ],
    gambling: [
      barsLegal
        ? "There's a high-stakes poker night downtown and you have a really good feeling about tonight."
        : "There's an underground card game across town and you have a really good feeling about tonight.",
      barsLegal ? 'You walked past a casino and heard the slot machines whispering sweet nothings.' : '@smartphone You keep refreshing a betting app you swore you deleted.',
      barsLegal ? 'You walked past a bookmaker’s window and felt your pocket twitch.' : '@!smartphone You keep drifting past a backroom bookmaker you swore you would avoid.',
      'Your gut says this is the year you win big. Your gut has said that every year.',
    ],
    nicotine: ["You're fidgety and irritable. You'd trade a kidney for a smoke right now.", 'Everyone on your break is lighting up and the smell is driving you crazy.'],
    other: [`The urge for ${subject} is back and it's stronger than ever.`, `You can't stop thinking about ${subject}.`],
  }
  const text = freshLine(g, `craving.${kind}`, eraLines(g, lines[kind]))
  scriptChoice(
    g,
    CRAVING,
    'Cravings',
    `${text} What will you do?`,
    [
      { id: 'giveIn', label: 'Give in', emoji: '\u{1F648}' },
      { id: 'resist', label: 'Resist the urge', emoji: '\u{1F4AA}' },
      { id: 'group', label: 'Go to a support group', emoji: '\u{1F91D}' },
    ],
    { emoji: kind === 'alcohol' ? '\u{1F37A}' : kind === 'gambling' ? '\u{1F3B0}' : kind === 'nicotine' ? '\u{1F6AC}' : '\u{1F48A}', data: { conditionId: worst.id } },
  )
}

function relapseCheck(g: GameState): void {
  const c = g.character
  if (inPrison(g) || c.age < 14) return
  const recovered = strList(g.flags.recoveredAddictions)
  // Old habits come knocking now and then, not every year.
  if (recovered.length === 0 || yearsSince(g, 'relapseAge') < 4 || !chance(g, 0.05)) return
  g.flags.relapseAge = c.age
  const name = pick(g, recovered)
  const subject = addictionSubject(name)
  scriptChoice(
    g,
    RELAPSE,
    'Old Habits',
    pick(g, [
      `You ran into some old friends from your ${subject} days. They offered to "catch up like old times." What will you do?`,
      `It's been a rough year and the old craving for ${subject} came roaring back. What will you do?`,
      `You found an old stash of ${subject} while cleaning out a drawer. What will you do?`,
    ]),
    [
      { id: 'strong', label: 'Stay strong', emoji: '\u{1F4AA}' },
      { id: 'giveIn', label: 'Just this once', emoji: '\u{1F648}' },
    ],
    { emoji: '\u{1F622}', data: { name } },
  )
}

function readdAddiction(g: GameState, name: string, severity: number): void {
  const c = g.character
  if (c.conditions.some((x) => x.kind === 'addiction' && x.name === name)) return
  c.conditions.push({ id: uid(g, 'c'), name, kind: 'addiction', severity, yearsHad: 0, curable: true, diagnosed: true, age: c.age })
  g.flags.recoveredAddictions = strList(g.flags.recoveredAddictions).filter((n) => n !== name)
  g.flags.knownAddictions = [...strList(g.flags.knownAddictions).filter((n) => n !== name), name]
}

function giveInEffects(g: GameState, cond: Condition): string {
  const kind = addictionKind(cond.name)
  const subject = addictionSubject(cond.name)
  cond.severity = Math.min(100, cond.severity + randInt(g, 5, 10))
  addStat(g, 'happiness', randInt(g, 4, 10))
  switch (kind) {
    case 'alcohol':
      addStat(g, 'health', -randInt(g, 3, 8))
      log(g, pick(g, ['I gave in to my cravings and went on a bender.', 'I drank until I forgot why I was trying to quit.']), 'bad')
      return pick(g, ['You went on a bender and woke up on a stranger\'s lawn wearing one shoe.', 'One drink became twelve. Your liver has filed a formal complaint.'])
    case 'gambling': {
      const cash = Math.max(0, g.character.money)
      const loss = Math.min(cash, Math.round(cash * randFloat(g, 0.05, 0.2) + randInt(g, 100, 1500)))
      if (loss > 0) addMoney(g, -loss)
      log(g, loss > 0 ? `I lost ${formatMoney(loss)} feeding my gambling habit.` : 'I tried to gamble, but I was too broke to place a bet.', 'bad')
      return loss > 0 ? `You lost ${formatMoney(loss)} chasing the big win. It was definitely due any minute now.` : "You were itching to gamble, but you didn't have a cent to bet. Silver linings."
    }
    case 'nicotine':
      addStat(g, 'health', -randInt(g, 1, 4))
      log(g, 'I gave in and bought another pack.', 'bad')
      return 'You bought a pack and smoked half of it before you got home.'
    case 'drug':
      count(g, 'drugs')
      addStat(g, 'health', -randInt(g, 5, 12))
      log(g, freshLine(g, 'relapse', [`I relapsed and used ${subject} again.`, `I fell off the wagon with ${subject}.`, `I swore it was the last time I'd use ${subject}. It wasn't.`]), 'bad')
      return pick(g, [`You used ${subject} again. It felt great for about an hour.`, `You gave in to ${subject}. Your body is not thanking you.`])
    default:
      log(g, `I gave in to my ${subject} habit again.`, 'bad')
      return `You gave in to your ${subject} habit. Again.`
  }
}

const SYMPTOMS = defineScript('health.symptoms', (g, choice, data) => {
  const id = (data as { conditionId?: string } | undefined)?.conditionId
  const cond = g.character.conditions.find((x) => x.id === id)
  if (!g.character.alive) return
  if (choice === 'doctor') {
    visitDoctor(g, medicalDoctors(g)[0])
    return
  }
  if (choice === 'web') {
    const real = cond ? conditionLabel(cond.name) : 'nothing serious'
    const decoys = DISEASES.filter((d) => d.name !== cond?.name && !d.sti && d.ages[0] <= g.character.age && (!ERA_ONLY.has(d.name) || eraOnlyWeight(g, d.name) > 0)).map((d) => conditionLabel(d.name))
    const guesses = [chance(g, 0.5) ? real : pick(g, decoys), pick(g, decoys), pick(g, decoys)]
    const unique = [...new Set(guesses)]
    if (noInternetYet(g)) {
      notice(
        g,
        'Home Diagnosis',
        pick(g, [
          `According to a dusty medical encyclopedia, you either have ${listJoin(unique)}. Very reassuring.`,
          `After an evening with the family medical book, you've concluded you have ${listJoin(unique)}. Possibly all at once.`,
          `The medical book says it's either ${listJoin(unique)}. Your grandmother suggests a mustard plaster.`,
        ]),
        { emoji: '\u{1F4D6}' },
      )
      log(g, freshLine(g, 'readSymptoms', ['I looked up my symptoms in a medical book and scared myself half to death.', 'I diagnosed myself with the family medical encyclopedia. It did not go well.', 'I asked the whole family about my symptoms and got five different diagnoses.']))
      return
    }
    notice(
      g,
      'Internet Diagnosis',
      pick(g, [
        `According to a sketchy medical forum, you either have ${listJoin(unique)}. Very reassuring.`,
        `After three hours of searching symptoms online, you've concluded you have ${listJoin(unique)}. Possibly all at once.`,
        `The internet says it's either ${listJoin(unique)}. A commenter also suggested essential oils.`,
      ]),
      { emoji: '\u{1F4BB}' },
    )
    log(g, freshLine(g, 'searchedSymptoms', ['I searched my symptoms online and scared myself half to death.', 'I diagnosed myself on the internet. It did not go well.', 'I spent a night reading medical forums and regretted it.']))
    return
  }
  log(g, freshLine(g, 'ignoredSymptoms', ['I ignored my symptoms and hoped for the best.', 'I decided whatever I had would sort itself out.', 'I walked it off. Or tried to.', 'I told my body to toughen up.']))
})

const CRAVING = defineScript('health.addiction.craving', (g, choice, data) => {
  const id = (data as { conditionId?: string } | undefined)?.conditionId
  const cond = g.character.conditions.find((x) => x.id === id)
  if (!cond || !g.character.alive) return
  const c = g.character
  const subject = addictionSubject(cond.name)
  if (choice === 'giveIn') {
    notice(g, 'Cravings', giveInEffects(g, cond), { emoji: '\u{1F648}', tone: 'bad' })
    return
  }
  const group = choice === 'group'
  const p = Math.max(0.1, Math.min(0.9, (group ? 0.5 : 0.35) + c.hidden.willpower / 250 + c.hidden.discipline / 500 - cond.severity / 300))
  if (chance(g, p)) {
    cond.severity -= randInt(g, group ? 15 : 10, group ? 30 : 20)
    addHidden(g, 'willpower', randInt(g, 1, 4))
    if (cond.severity <= 0) {
      removeCondition(g, cond.id)
      g.flags.knownAddictions = strList(g.flags.knownAddictions).filter((n) => n !== cond.name)
      g.flags.recoveredAddictions = [...strList(g.flags.recoveredAddictions).filter((n) => n !== cond.name), cond.name]
      addStat(g, 'happiness', randInt(g, 10, 20))
      addStat(g, 'health', randInt(g, 3, 8))
      notice(g, 'Clean Slate', `You've finally kicked your ${subject} habit for good! Your future self is sending you a thank-you card.`, { emoji: '\u{1F389}', tone: 'good' })
      log(g, `I beat my ${subject} addiction.`, 'good')
      remember(g, `Overcame a ${subject} addiction.`)
      return
    }
    addStat(g, 'happiness', -randInt(g, 0, 3))
    notice(
      g,
      group ? 'Support Group' : 'Willpower',
      group
        ? pick(g, [
            `You went to a support group meeting and shared your story. The free coffee was terrible, but the cravings eased.`,
            `A room full of strangers clapped for you. You feel a little stronger against ${subject}.`,
          ])
        : pick(g, [`You white-knuckled it and the craving passed. You're winning, one day at a time.`, `You went for a long walk instead. The urge for ${subject} faded.`]),
      { emoji: '\u{1F4AA}', tone: 'good' },
    )
    log(g, group ? freshLine(g, 'groupLine', [`I went to a support group meeting for my ${subject} problem.`, `I shared my story about ${subject} at a support group.`, 'I picked up another sobriety chip at my support group.']) : freshLine(g, 'resistLine', [`I resisted the urge to give in to ${subject}.`, `I fought off a craving for ${subject}.`, `I stayed strong against ${subject} this year.`]), 'good')
    return
  }
  cond.severity = Math.min(100, cond.severity + 3)
  addStat(g, 'happiness', -randInt(g, 3, 6))
  notice(
    g,
    'Cravings',
    pick(g, [
      `You held out for almost a week before caving. ${giveInEffects(g, cond)}`,
      `${group ? 'You sat through the meeting, then went straight back to your old habits.' : 'You tried to resist, but the craving won.'} ${giveInEffects(g, cond)}`,
    ]),
    { emoji: '\u{1F61E}', tone: 'bad' },
  )
})

const RELAPSE = defineScript('health.addiction.relapse', (g, choice, data) => {
  const name = (data as { name?: string } | undefined)?.name
  if (!name || !g.character.alive) return
  const subject = addictionSubject(name)
  const c = g.character
  if (choice === 'strong' && chance(g, Math.min(0.9, 0.55 + c.hidden.willpower / 250))) {
    addStat(g, 'happiness', randInt(g, 3, 8))
    addHidden(g, 'willpower', randInt(g, 1, 3))
    notice(g, 'Old Habits', `You walked away. The old you would never have managed that. Proud of you.`, { emoji: '\u{1F4AA}', tone: 'good' })
    log(g, `I resisted falling back into my old ${subject} habit.`, 'good')
    return
  }
  readdAddiction(g, name, choice === 'strong' ? 25 : 30)
  addStat(g, 'happiness', choice === 'strong' ? -randInt(g, 4, 8) : randInt(g, 2, 6))
  addStat(g, 'health', -randInt(g, 2, 6))
  notice(
    g,
    'Relapse',
    choice === 'strong'
      ? `You tried to stay strong, but "just one" turned into a whole lot more. You're hooked on ${subject} again.`
      : `"Just this once" lasted about a week. You're hooked on ${subject} again.`,
    { emoji: '\u{1F61E}', tone: 'bad' },
  )
  log(g, `I relapsed and got hooked on ${subject} again.`, 'bad')
})

// ---------------------------------------------------------------------------
// Eyesight

const FRAMES: ChoiceOption[] = [
  { id: 'Round glasses', label: 'Round frames', emoji: '\u{1F453}' },
  { id: 'Square glasses', label: 'Square frames', emoji: '\u{1F453}' },
  { id: 'Thick-rimmed glasses', label: 'Thick-rimmed frames', emoji: '\u{1F453}' },
  { id: 'Cat-eye glasses', label: 'Cat-eye frames', emoji: '\u{1F453}' },
  { id: 'Aviator glasses', label: 'Aviator frames', emoji: '\u{1F576}\u{FE0F}' },
]

function eyesight(g: GameState): void {
  const c = g.character
  const poor = g.flags.eyesight === 'poor'
  if (!poor) {
    const p = c.age >= 7 && c.age <= 16 ? 0.035 : c.age >= 42 && c.age <= 70 ? 0.05 : 0
    if (p > 0 && chance(g, p)) {
      g.flags.eyesight = 'poor'
      g.flags.eyesightCorrected = false
      if (c.age < 18) {
        const parent = aliveParent(g)
        if (parent && !inPrison(g)) {
          scriptChoice(
            g,
            EYE_EXAM,
            'Eye Exam',
            `Your ${parentWord(parent)} noticed you squinting at ${hasTech(g, 'tv') ? 'the TV' : 'a book'} and took you to the optometrist for an eye exam. The optometrist points at a chart full of tiny letters. What will you do?`,
            [
              { id: 'honest', label: 'Read the chart honestly', emoji: '\u{1F440}' },
              { id: 'squint', label: 'Squint really hard', emoji: '\u{1F611}' },
              { id: 'memorize', label: 'Recite it from memory', emoji: '\u{1F9E0}' },
            ],
            { emoji: '\u{1F441}\u{FE0F}' },
          )
        } else {
          log(g, 'Everything far away has started looking blurry.', 'bad')
        }
      } else {
        log(g, c.age >= 42 ? "I've started holding menus at arm's length to read them." : 'My vision has been getting blurry lately.', 'bad')
      }
    }
    return
  }
  if (g.flags.eyesightCorrected !== true && chance(g, 0.3)) addStat(g, 'happiness', -1)
}

const EYE_EXAM = defineScript('health.eyeExam', (g, choice) => {
  const c = g.character
  let passed: boolean
  if (choice === 'memorize') passed = c.stats.smarts >= 60 && chance(g, 0.7)
  else if (choice === 'squint') passed = chance(g, 0.35)
  else passed = false
  if (passed) {
    addStat(g, 'happiness', 16)
    notice(
      g,
      'Eye Exam',
      choice === 'memorize'
        ? "You recited the chart perfectly from memory. The optometrist is impressed, if a little suspicious. You passed! (Your eyes are still blurry, but who's counting?)"
        : "You squinted so hard your face hurt, but you passed the eye exam! Your eyes, however, are still not great.",
      { emoji: '\u{1F44D}', tone: 'good' },
    )
    log(g, 'I passed my eye exam. Barely.', 'good')
    return
  }
  scriptChoice(
    g,
    GLASSES,
    'Glasses',
    choice === 'honest'
      ? "You couldn't read past the second line. The optometrist says you need glasses. Your parents will pay. Pick your frames!"
      : "Nice try. The optometrist saw right through you. You need glasses, and your parents are paying. Pick your frames!",
    FRAMES,
    { emoji: '\u{1F453}', data: { kid: true } },
  )
})

const GLASSES = defineScript('health.glasses', (g, choice, data) => {
  const d = (data ?? {}) as { lasikCost?: number; contactsCost?: number; glassesCost?: number }
  if (choice === 'none') {
    log(g, 'I decided I could live with blurry vision.')
    return
  }
  if (choice === 'lasik') {
    const cost = d.lasikCost ?? 0
    if (cost > 0 && !spend(g, cost)) return tooBroke(g, 'laser eye surgery', cost)
    if (chance(g, 0.92)) {
      g.flags.eyesight = 'good'
      g.flags.eyesightCorrected = true
      g.flags.eyewear = null
      addStat(g, 'happiness', randInt(g, 8, 14))
      notice(g, 'Laser Eye Surgery', 'They zapped your eyeballs with a laser and now you can see perfectly. Welcome to high definition!', { emoji: '\u{1F441}\u{FE0F}', tone: 'good' })
      log(g, 'I got laser eye surgery and can finally see clearly.', 'good')
    } else {
      addStat(g, 'happiness', -randInt(g, 5, 10))
      notice(g, 'Laser Eye Surgery', "The surgery didn't quite take. Your vision is about the same, and your wallet is lighter.", { emoji: '\u{1F615}', tone: 'bad' })
      log(g, "My laser eye surgery didn't work.", 'bad')
    }
    return
  }
  if (choice === 'contacts') {
    const cost = d.contactsCost ?? 0
    if (cost > 0 && !spend(g, cost)) return tooBroke(g, 'contact lenses', cost)
    g.flags.eyewear = 'Contact lenses'
    g.flags.eyesightCorrected = true
    notice(g, 'Contact Lenses', 'You can see clearly now, and nobody can tell. The first week of poking yourself in the eye was rough, though.', { emoji: '\u{1F441}\u{FE0F}', tone: 'good' })
    log(g, 'I started wearing contact lenses.', 'good')
    return
  }
  const frame = FRAMES.find((f) => f.id === choice)
  if (!frame) return
  const cost = d.glassesCost ?? 0
  if (cost > 0 && !spend(g, cost)) return tooBroke(g, 'new glasses', cost)
  g.flags.eyewear = frame.id
  g.flags.eyesightCorrected = true
  const delta = randInt(g, -3, 4)
  addStat(g, 'looks', delta)
  notice(
    g,
    'New Glasses',
    delta >= 0
      ? `You picked out ${frame.label.toLowerCase()}. They suit you! The world is suddenly full of tiny details you never noticed.`
      : `You picked out ${frame.label.toLowerCase()}. You can see perfectly now, including how questionable they look on you.`,
    { emoji: '\u{1F453}', tone: 'good' },
  )
  log(g, `I got ${frame.id.toLowerCase()}.`, 'good')
})

// ---------------------------------------------------------------------------
// Little kids: parents handle doctor visits.

function babyCare(g: GameState): void {
  const c = g.character
  if (c.age >= 18) return
  const parent = aliveParent(g)
  if (!parent || inPrison(g)) return
  const who = parentWord(parent)
  for (const cond of treatableNonAddiction(g)) {
    const def = defFor(cond)
    if (c.age >= 4) {
      // Older kids see the doctor themselves, but parents step in when it gets serious.
      if (!def.deadly || cond.yearsHad < 1 || !chance(g, 0.6)) continue
    } else if (cond.yearsHad < 1 && cond.severity < 15) continue
    const label = conditionLabel(cond.name)
    const wasKnown = cond.diagnosed
    cond.diagnosed = true
    count(g, 'doctorVisits')
    if (def.cure > 0 && chance(g, Math.min(0.95, def.cure + 0.05))) {
      removeCondition(g, cond.id)
      addStat(g, 'health', randInt(g, 2, 6))
      log(
        g,
        c.age < 4
          ? pick(g, [`My ${who} took me to the doctor, where I was treated for ${label}.`, `My ${who} rushed me to the pediatrician and I was cured of ${label}.`])
          : `My ${who} noticed how sick I was and dragged me to the doctor. I was treated for ${label}.`,
        'good',
      )
    } else {
      if (def.deadly) cond.severity = Math.max(1, cond.severity - randInt(g, 5, 12))
      log(g, `My ${who} took me to the doctor for ${label}, but the treatment didn't work.`, 'bad')
      if (!wasKnown && c.age >= 4) notice(g, 'Diagnosis', `Your ${who} took you to the doctor, who diagnosed you with ${label}. The treatment didn't work this time.`, { emoji: '\u{1FA7A}', tone: 'bad' })
    }
  }
}

// ---------------------------------------------------------------------------
// Yearly stat drift

/** Typical health for an age with no illness or exercise. */
export function healthTarget(age: number): number {
  if (age < 40) return 85
  if (age < 60) return 85 - (age - 40) * 0.5
  if (age < 80) return 75 - (age - 60) * 1.25
  return Math.max(5, 50 - (age - 80) * 2.5)
}

function statDrift(g: GameState): void {
  const c = g.character
  const a = c.age
  // Happiness wobbles and drifts toward a comfortable middle.
  let dh = randInt(g, -4, 4) + Math.round((60 - c.stats.happiness) * 0.06)
  if (a <= 2) dh += randInt(g, 0, 3)
  addStat(g, 'happiness', dh)

  // Health drifts toward what's normal for your age: steady when young, a slow
  // decline after 40, faster after 60 and steep after 80. Illness pushes it below the
  // curve; the body slowly recovers once you're cured.
  addStat(g, 'health', Math.round((healthTarget(a) - c.stats.health) * 0.15) + randInt(g, -2, 2))

  // Smarts grow through childhood, plateau, then fade a little in old age.
  let smarts: number
  if (a <= 18) smarts = randInt(g, -1, 3)
  else if (a < 75) smarts = randInt(g, -1, 1)
  else smarts = randInt(g, -1, 0)
  addStat(g, 'smarts', smarts)

  // Looks: random in childhood, then gravity wins.
  let looks: number
  if (a <= 18) looks = randInt(g, -2, 2)
  else if (a < 36) looks = randInt(g, -1, 1)
  else if (a < 56) looks = randInt(g, -2, 0)
  else if (a < 70) looks = randInt(g, -3, 0)
  else looks = randInt(g, -4, -1)
  // Modeling talent: good bones. Adult looks fade about half as fast (no extra dice rolled).
  if (a > 18 && looks < 0 && hasTalent(g, 'Modeling')) looks = Math.round(looks / 2)
  addStat(g, 'looks', looks)
}

/**
 * Yearly hook: stat drift, illness progression, new illnesses, addictions, eyesight.
 * Never kills directly; checkDeath() runs after all yearly hooks.
 */
export function yearlyHealth(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  trackRecovery(g)
  statDrift(g)
  progressConditions(g)
  processAddictions(g)
  maybeContract(g)
  babyCare(g)
  eyesight(g)
  relapseCheck(g)
  trackRecovery(g)
  if (c.stats.health <= 20 && c.stats.health > 0 && c.age >= 4 && !g.flags.lowHealthWarned && yearsSince(g, 'lowHealthWarnedAge') >= 3) {
    g.flags.lowHealthWarned = true
    g.flags.lowHealthWarnedAge = c.age
    notice(
      g,
      'Feeling Weak',
      c.age >= 75
        ? "You've been feeling frail lately. Your body isn't what it used to be. It might be time to see a doctor."
        : "You've been feeling terrible lately and you're running out of steam. You should really see a doctor.",
      { emoji: '\u{1F915}', tone: 'bad' },
    )
  } else if (c.stats.health > 35) {
    g.flags.lowHealthWarned = false
  }
}

// ---------------------------------------------------------------------------
// Death

function deathCauseForHealth(g: GameState): string {
  const c = g.character
  const bySeverity = [...c.conditions].sort((a, b) => b.severity - a.severity)
  const deadly = bySeverity.find((x) => x.kind !== 'addiction' && x.kind !== 'mental' && defFor(x).deadly)
  if (deadly) return defFor(deadly).deadly as string
  const addiction = bySeverity.find((x) => x.kind === 'addiction' && addictionKind(x.name) !== 'gambling' && addictionKind(x.name) !== 'other')
  if (addiction) {
    const k = addictionKind(addiction.name)
    return k === 'alcohol' ? 'Alcohol Poisoning' : k === 'drug' ? 'Drug Overdose' : 'Lung Failure'
  }
  const physical = bySeverity.find((x) => x.kind !== 'mental' && x.kind !== 'addiction' && x.severity >= 10)
  if (physical) return physical.kind === 'injury' ? 'Complications From Injuries' : `Complications From ${physical.name}`
  if (c.age >= 70) return 'Old Age'
  return c.age < 5 ? 'Illness' : 'Heart Failure'
}

/** Yearly chance of dying of old age (BitLife lives usually end between 70 and 100). */
export function oldAgeHazard(age: number, health: number, happiness: number): number {
  let p: number
  if (age < 60) p = 0
  else if (age < 70) p = 0.004 + (age - 60) * 0.0006
  else if (age < 80) p = 0.012 + (age - 70) * 0.004
  else if (age < 90) p = 0.055 + (age - 80) * 0.011
  else if (age < 100) p = 0.17 + (age - 90) * 0.02
  else p = 0.36 + (age - 100) * 0.01
  if (p === 0) return 0
  p *= 1.6 - (health / 100) * 1.1
  if (happiness < 20) p *= 1.15
  // The real game rewards perfect upkeep at extreme ages.
  if (age >= 100 && happiness >= 98 && health >= 80) p *= 0.3
  return Math.min(0.9, Math.max(0, p))
}

const CHILD_ACCIDENTS = ['Choking', 'Drowning', 'Accidental Fall']
const ADULT_ACCIDENTS = ['Car Accident', 'Accidental Fall', 'Choking', 'Drowning']

/** Yearly death check; runs after all yearly hooks. */
export function checkDeath(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  if (c.stats.health <= 0) {
    killCharacter(g, deathCauseForHealth(g))
    return
  }
  // Untreated deadly illnesses can finish you off suddenly.
  const deadly = c.conditions.filter((x) => x.kind !== 'addiction' && defFor(x).deadly).sort((a, b) => b.severity - a.severity)
  for (const cond of deadly) {
    const def = defFor(cond)
    let p = (cond.severity / 100) * (c.stats.health < 15 ? 0.45 : c.stats.health < 30 ? 0.2 : 0.02)
    if (def.name === 'High Blood Pressure') p += 0.003 + cond.severity / 3000
    if (def.name === 'Heart Disease') p += 0.02 + cond.severity / 1500
    if (chance(g, p)) {
      killCharacter(g, def.deadly ?? cond.name)
      return
    }
  }
  // Addictions: overdoses and alcohol poisoning.
  if (c.age >= 14) {
    for (const a of c.conditions.filter((x) => x.kind === 'addiction')) {
      const kind = addictionKind(a.name)
      let p = 0
      if (kind === 'drug') p = 0.01 + (a.severity / 100) * 0.05 + (c.stats.health < 30 ? 0.06 : 0)
      else if (kind === 'alcohol') p = a.severity > 60 && c.stats.health < 35 ? 0.04 : 0.004
      if (p > 0 && chance(g, p)) {
        killCharacter(g, kind === 'drug' ? 'Drug Overdose' : 'Alcohol Poisoning')
        return
      }
    }
  }
  const hazard = oldAgeHazard(c.age, c.stats.health, c.stats.happiness)
  // Shorter lives before modern medicine, gently (exactly today's odds from PRESENT_YEAR on).
  if (chance(g, isHistorical(g.year) ? Math.min(0.9, hazard * eraOldAgeFactor(c.countryId, g.year)) : hazard)) {
    killCharacter(g, 'Old Age')
    return
  }
  // Rare freak accidents.
  if (c.age <= 12) {
    if (chance(g, 0.00015)) killCharacter(g, pick(g, CHILD_ACCIDENTS))
  } else if (c.age < 70 && !inPrison(g)) {
    if (chance(g, 0.00025)) killCharacter(g, pick(g, ADULT_ACCIDENTS))
  }
}

// ---------------------------------------------------------------------------
// Doctor visits

interface DoctorInfo {
  /** "Dr. Jane Smith" or "the prison doctor". */
  title: string
  /** 1-5 reputation. */
  quality: number
  /** List price of a consultation. */
  fee: number
  place: 'clinic' | 'prison' | 'er'
}

function stars(q: number): string {
  return '\u{2605}'.repeat(q) + '\u{2606}'.repeat(5 - q)
}

function doctorName(g: GameState, seed: string): string {
  const c = g.character
  const pool = NAME_POOLS[getCountry(c.countryId).names] ?? NAME_POOLS.anglo
  const h = hash(seed)
  const female = h % 2 === 0
  const firsts = female ? pool.female : pool.male
  return `${firsts[(h >>> 3) % firsts.length]} ${pool.last[(h >>> 11) % pool.last.length]}`
}

/** The two clinic doctors available this year (stable while browsing the menu). */
function medicalDoctors(g: GameState): DoctorInfo[] {
  if (inPrison(g)) return [{ title: 'the prison doctor', quality: 2, fee: 0, place: 'prison' }]
  const pf = priceFactor(g)
  return [0, 1].map((i) => {
    const seed = `${g.lifeId}|${g.character.age}|md|${i}`
    const h = hash(seed + '#q')
    const quality = 1 + (h % 5)
    const fee = Math.round((80 + quality * 35 + (h % 41)) * pf)
    return { title: `Dr. ${doctorName(g, seed)}`, quality, fee, place: 'clinic' as const }
  })
}

const TIER_PRICES: Record<1 | 2 | 3 | 4, [number, number]> = {
  1: [150, 600],
  2: [1200, 5000],
  3: [6000, 20000],
  4: [15000, 60000],
}

function treatmentPrice(g: GameState, cond: Condition, doc: DoctorInfo): number {
  const def = defFor(cond)
  const [lo, hi] = TIER_PRICES[def.tier]
  const h = hash(`${cond.id}|${doc.title}`) % 1000
  const list = (lo + ((hi - lo) * h) / 1000) * priceFactor(g) * (0.8 + doc.quality * 0.1)
  return patientCost(g, Math.round(list / 10) * 10)
}

function qualityFactor(q: number): number {
  return 0.7 + q * 0.08
}

/** Can a medical doctor treat this condition for this patient? */
function mdCanTreat(g: GameState, cond: Condition): boolean {
  if (cond.kind === 'addiction') return false
  if (cond.kind === 'mental' && g.character.age >= 18) return false
  return true
}

const CLEAN_BILL = [
  '{doc} poked, prodded and listened to your heart, then declared you perfectly healthy.',
  '{doc} ran a few tests and found absolutely nothing wrong with you. Hypochondria is not covered.',
  '{doc} says you are as healthy as a horse. A slightly out-of-shape horse, but still.',
  '{doc} gave you a full checkup and a lollipop. You are in good health.',
]

function visitDoctor(g: GameState, doc: DoctorInfo): void {
  const c = g.character
  if (!c.alive) return
  if (c.age < 4) {
    notice(g, 'Doctor', "You're too young to go to the doctor on your own. Your parents will take you if you're sick.", { emoji: '\u{1F476}' })
    return
  }
  const fee = patientCost(g, doc.fee)
  if (fee > 0 && !canAfford(g, fee)) return tooBroke(g, `a consultation with ${doc.title}`, fee)
  const limit = doc.place === 'prison' ? 2 : 4
  if (!useYearAction(g, 'doctor', limit)) {
    notice(
      g,
      'Doctor',
      pick(g, [
        `${cap(doc.title)}'s receptionist says you've been in so often this year they're naming a chair after you. Come back next year.`,
        "You've already seen the doctor plenty this year. Try again after your next birthday.",
      ]),
      { emoji: '\u{1FA7A}' },
    )
    return
  }
  spend(g, fee)
  count(g, 'doctorVisits')
  const parent = c.age < 18 ? aliveParent(g) : undefined
  // Before the 1960s, in countries that had them, the family doctor came to the house with his black bag.
  const houseCall = doc.place === 'clinic' && isHistorical(g.year) && medicalYear(c.countryId, g.year) < 1965 && getCountry(c.countryId).wealth >= 0.5
  const intro = houseCall
    ? parent
      ? `Your ${parentWord(parent)} sent for ${doc.title}, who came to the house with a black bag. `
      : `${cap(doc.title)} made a house call, black bag in hand. `
    : parent
      ? `Your ${parentWord(parent)} took you to see ${doc.title}. `
      : ''

  const newly: string[] = []
  for (const cond of c.conditions) {
    if (cond.kind === 'addiction') continue
    if (!cond.diagnosed) newly.push(conditionLabel(cond.name))
    cond.diagnosed = true
  }
  const treatable = c.conditions.filter((x) => mdCanTreat(g, x)).sort((a, b) => b.severity - a.severity)
  const mental = c.conditions.filter((x) => x.kind === 'mental' && c.age >= 18)
  const addictions = c.conditions.filter((x) => x.kind === 'addiction')

  if (treatable.length === 0) {
    let text = intro + fill(pick(g, CLEAN_BILL), { doc: cap(doc.title) })
    if (mental.length > 0) text = `${intro}${cap(doc.title)} says your ${listJoin(mental.map((m) => conditionLabel(m.name)))} is outside their expertise and suggests you see a psychiatrist.`
    if (addictions.length > 0) text += ` ${cap(doc.title)} also strongly suggests rehab for your ${listJoin(addictions.map((a) => addictionSubject(a.name)))} problem.`
    if (mental.length === 0) addStat(g, 'health', randInt(g, 1, 3))
    notice(g, cap(doc.title), text, { emoji: '\u{1FA7A}', tone: 'good' })
    log(g, pick(g, [`I went to see ${doc.title} for a checkup.`, `I visited ${doc.title}, who said I was fine.`]))
    return
  }

  const shown = treatable.slice(0, 4)
  const costs: Record<string, number> = {}
  const choices: ChoiceOption[] = shown.map((cond) => {
    const cost = treatmentPrice(g, cond, doc)
    costs[cond.id] = cost
    return { id: cond.id, label: `Treat ${conditionLabel(cond.name)} (${cost > 0 ? formatMoney(cost) : 'free'})`, emoji: '\u{1F48A}' }
  })
  choices.push({ id: 'leave', label: 'Leave without treatment', emoji: '\u{1F6B6}' })
  const names = treatable.map((x) => conditionLabel(x.name))
  const diag =
    newly.length > 0
      ? `After a few tests, ${doc.title} diagnosed you with ${listJoin(newly)}.`
      : `${cap(doc.title)} looked over your chart: ${listJoin(names)}.`
  const extra = mental.length > 0 ? ` For your ${listJoin(mental.map((m) => conditionLabel(m.name)))}, you'll need a psychiatrist.` : ''
  const payer = parent ? ` Your ${parentWord(parent)} will cover the bill.` : ''
  scriptChoice(g, TREAT, cap(doc.title), `${intro}${diag}${extra}${payer} What would you like treated?`, choices, {
    emoji: '\u{1FA7A}',
    data: { doctor: doc.title, quality: doc.quality, costs },
  })
  log(g, newly.length > 0 ? `${cap(doc.title)} diagnosed me with ${listJoin(newly)}.` : `I went to see ${doc.title}.`)
}

const CURED_LINES = [
  'The treatment worked! You are no longer suffering from {name}.',
  "{doc} treated your {name} and you're good as new.",
  'Success! {doc} cured your {name}. You feel like a new person.',
  "You've been cured of {name}. {doc} looks very pleased with themselves.",
]
const FAILED_LINES = [
  'Despite the treatment, you are still suffering from {name}.',
  "{doc}'s treatment didn't work. You still have {name}.",
  'The treatment for your {name} was unsuccessful. Maybe try another doctor?',
]

/** Attempt to cure a condition. `p` is the success chance. */
function attemptCure(g: GameState, cond: Condition, p: number, who: string, emoji = '\u{1FA7A}'): boolean {
  const def = defFor(cond)
  const label = conditionLabel(cond.name)
  if (def.cure <= 0 && !def.cancer && cond.kind !== 'injury') {
    addStat(g, 'health', randInt(g, 4, 9))
    const floor = Math.min(cond.severity, Math.max(1, Math.ceil(def.sev[0] / 2)))
    cond.severity = Math.max(floor, cond.severity - randInt(g, 3, 8))
    notice(g, cap(who), `There's no cure for ${label}, but ${who} prescribed something to keep the symptoms in check. You feel a bit better.`, { emoji })
    log(g, `I got treatment to manage my ${label}.`)
    return false
  }
  if (chance(g, Math.min(0.97, p))) {
    removeCondition(g, cond.id)
    addStat(g, 'happiness', randInt(g, 6, 14))
    addStat(g, 'health', randInt(g, 4, 12))
    if (def.looks) addStat(g, 'looks', randInt(g, 1, 4))
    notice(g, 'Cured', fill(pick(g, CURED_LINES), { name: label, doc: cap(who) }), { emoji: '\u{1F389}', tone: 'good' })
    log(g, pick(g, [`I was cured of ${label}.`, `${cap(who)} cured my ${label}.`]), 'good')
    if (def.deadly) remember(g, `Survived ${label}.`)
    return true
  }
  if (def.deadly) {
    cond.severity = Math.max(1, cond.severity - randInt(g, 5, 15))
    addStat(g, 'health', randInt(g, 2, 6))
  }
  addStat(g, 'happiness', -randInt(g, 2, 6))
  notice(
    g,
    'Treatment Failed',
    fill(pick(g, FAILED_LINES), { name: label, doc: cap(who) }) + (def.deadly ? ' It did seem to slow things down, at least.' : ''),
    { emoji: '\u{1F61E}', tone: 'bad' },
  )
  log(g, `The treatment for my ${label} didn't work.`, 'bad')
  return false
}

const TREAT = defineScript('health.doctor.treat', (g, choice, data) => {
  const d = (data ?? {}) as { doctor?: string; quality?: number; costs?: Record<string, number> }
  const doc = d.doctor ?? 'the doctor'
  if (!g.character.alive) return
  if (choice === 'leave') {
    log(g, pick(g, ["I left the doctor's office without getting treated.", 'I decided not to get treated. Yet.']))
    return
  }
  const cond = g.character.conditions.find((x) => x.id === choice)
  if (!cond) return
  const cost = d.costs?.[choice] ?? 0
  if (cost > 0 && !spend(g, cost)) return tooBroke(g, `the treatment for ${conditionLabel(cond.name)}`, cost)
  const def = defFor(cond)
  let p = def.cure * qualityFactor(d.quality ?? 3)
  // No antibiotics before the 1940s, weaker cancer care for decades (1 in modern years).
  if (isHistorical(g.year)) p *= eraCureFactor(g.character.countryId, g.year, def.name, def.cancer === true)
  if (cond.kind === 'mental') p *= 0.6
  if (def.cancer) p *= Math.max(0.4, 1 - Math.max(0, cond.severity - 50) / 100)
  attemptCure(g, cond, p, doc)
})

// ---------------------------------------------------------------------------
// Emergency room

function emergencyRoom(g: GameState): void {
  const c = g.character
  const list = Math.round(randInt(g, 800, 3000) * priceFactor(g))
  const cost = patientCost(g, list)
  if (cost > 0 && !canAfford(g, cost)) return tooBroke(g, 'an emergency room visit', cost)
  if (!useYearAction(g, 'er', 2)) {
    notice(g, 'Emergency Room', 'The triage nurse recognized you from your last visit and sent you home with an ice pack. Come back next year.', { emoji: '\u{1F3E5}' })
    return
  }
  spend(g, cost)
  count(g, 'doctorVisits')
  const parts: string[] = []
  const parent = c.age < 18 ? aliveParent(g) : undefined
  const dial = localTerm(g, 'emergencyNumber')
  parts.push(
    parent
      ? pick(g, [`Your ${parentWord(parent)} rushed you to the emergency room.`, `Your ${parentWord(parent)} panicked, called ${dial}, and an ambulance raced you to the emergency room.`])
      : pick(g, [
          'You waited four hours in the emergency room next to a guy with a fork in his hand.',
          'You checked into the emergency room and were seen surprisingly quickly.',
          `You called ${dial} and an ambulance took you to the emergency room. The paramedics seemed underwhelmed.`,
        ]),
  )
  const newly = c.conditions.filter((x) => x.kind !== 'addiction' && !x.diagnosed)
  for (const x of newly) x.diagnosed = true
  if (newly.length > 0) parts.push(`${c.countryId === 'us' ? 'The ER doctor' : 'The doctor on duty'} diagnosed you with ${listJoin(newly.map((x) => conditionLabel(x.name)))}.`)
  const cured: string[] = []
  for (const x of c.conditions.filter((y) => y.kind === 'injury')) {
    if (chance(g, 0.85)) {
      cured.push(conditionLabel(x.name))
      removeCondition(g, x.id)
    }
  }
  if (cured.length > 0) parts.push(`They patched up your ${listJoin(cured)}.`)
  const serious = c.conditions.filter((x) => x.kind !== 'addiction' && defFor(x).deadly)
  for (const x of serious) x.severity = Math.max(1, x.severity - randInt(g, 4, 10))
  if (serious.length > 0) parts.push('They stabilized you, but you should follow up with a doctor.')
  const gain = c.stats.health < 50 ? randInt(g, 10, 25) : randInt(g, 3, 8)
  addStat(g, 'health', gain)
  if (newly.length === 0 && cured.length === 0 && serious.length === 0) parts.push("They couldn't find anything wrong, but gave you fluids and a stern talking-to.")
  parts.push(cost > 0 ? `The bill came to ${formatMoney(cost)}.` : coverage(g) === 'public' ? "Thanks to public healthcare, it didn't cost a thing." : '')
  notice(g, 'Emergency Room', parts.filter(Boolean).join(' '), { emoji: '\u{1F3E5}', tone: 'good' })
  log(g, 'I went to the emergency room.')
}

// ---------------------------------------------------------------------------
// Alternative doctors

interface AltDef {
  id: AltTherapy
  label: string
  emoji: string
  subtitle: string
  price: number
  /** Base cure chance for conditions in its specialty. */
  cure: number
}

const ALT_DOCTORS: AltDef[] = [
  { id: 'acupuncture', label: 'Acupuncturist', emoji: '\u{1F4CD}', subtitle: 'Get stuck with needles', price: 120, cure: 0.45 },
  { id: 'chiropractic', label: 'Chiropractor', emoji: '\u{1F9B4}', subtitle: 'Get your spine cracked', price: 100, cure: 0.45 },
  { id: 'colon', label: 'Colon Hydrotherapist', emoji: '\u{1F6BF}', subtitle: "Don't ask", price: 150, cure: 0.25 },
  { id: 'homeopathy', label: 'Homeopathic Doctor', emoji: '\u{1F33F}', subtitle: 'Water with a fancy label', price: 90, cure: 0.08 },
]

function altPrice(g: GameState, alt: AltDef): number {
  return patientCost(g, Math.round(alt.price * priceFactor(g)), false)
}

function altTarget(g: GameState, alt: AltDef): Condition | undefined {
  const conds = g.character.conditions.filter((x) => x.kind !== 'addiction').sort((a, b) => b.severity - a.severity)
  if (alt.id === 'homeopathy') return conds.find((x) => !defFor(x).deadly)
  return conds.find((x) => defFor(x).alt?.includes(alt.id))
}

function visitAlt(g: GameState, alt: AltDef): void {
  const cost = altPrice(g, alt)
  if (!canAfford(g, cost)) return tooBroke(g, `a session with the ${alt.label.toLowerCase()}`, cost)
  if (!useYearAction(g, 'altDoctor', 4)) {
    notice(g, alt.label, "You've had enough alternative medicine for one year. Even the incense is tired of you.", { emoji: alt.emoji })
    return
  }
  spend(g, cost)
  count(g, 'doctorVisits')
  addStat(g, 'health', randInt(g, 1, 5))
  addStat(g, 'happiness', randInt(g, 1, 4))
  const target = altTarget(g, alt)
  const session = {
    acupuncture: pick(g, ['The acupuncturist turned you into a human pincushion.', 'You lay very still while a stranger stuck needles in your face.']),
    chiropractic: pick(g, ['The chiropractor cracked your back so loudly the waiting room flinched.', 'You heard sounds come out of your spine that you will never forget.']),
    colon: pick(g, ["The colon hydrotherapy session was... an experience. Let's leave it at that.", "You'll never look at a garden hose the same way again."]),
    homeopathy: pick(g, ['The homeopath gave you a tiny bottle of very expensive water.', 'You were prescribed sugar pills diluted in hope.']),
  }[alt.id]
  if (target) {
    target.diagnosed = true
    const label = conditionLabel(target.name)
    if (chance(g, alt.cure)) {
      removeCondition(g, target.id)
      addStat(g, 'happiness', randInt(g, 5, 10))
      notice(g, alt.label, `${session} Amazingly, your ${label} is gone!`, { emoji: alt.emoji, tone: 'good' })
      log(g, `The ${alt.label.toLowerCase()} cured my ${label}.`, 'good')
      return
    }
    notice(g, alt.label, `${session} You feel a little better, but you still have ${label}.`, { emoji: alt.emoji })
    log(g, `I saw the ${alt.label.toLowerCase()} about my ${label}. It didn't help much.`)
    return
  }
  notice(g, alt.label, `${session} You feel more relaxed, at least.`, { emoji: alt.emoji, tone: 'good' })
  log(g, `I went to see the ${alt.label.toLowerCase()}.`)
}

// ---------------------------------------------------------------------------
// Psychiatrist

function counseling(g: GameState): void {
  const c = g.character
  const cost = patientCost(g, Math.round(randInt(g, 150, 300) * priceFactor(g)))
  if (!canAfford(g, cost)) return tooBroke(g, 'a counseling session', cost)
  if (!useYearAction(g, 'psychiatrist', 3)) {
    notice(g, 'Psychiatrist', "Your psychiatrist is fully booked until next year. They suggest journaling. You've never journaled in your life.", { emoji: '\u{1F6CB}\u{FE0F}' })
    return
  }
  spend(g, cost)
  count(g, 'doctorVisits')
  addStat(g, 'happiness', randInt(g, 4, 12))
  const mental = c.conditions.filter((x) => x.kind === 'mental').sort((a, b) => b.severity - a.severity)
  for (const x of mental) x.diagnosed = true
  const opener = pick(g, [
    'You lay on a leather couch and talked about your childhood for an hour.',
    'Your psychiatrist nodded thoughtfully and asked how that made you feel. Several times.',
    'You talked through your problems with a very calm professional.',
  ])
  const target = mental[0]
  if (target) {
    const label = conditionLabel(target.name)
    if (chance(g, defFor(target).cure)) {
      removeCondition(g, target.id)
      addStat(g, 'happiness', randInt(g, 8, 16))
      notice(g, 'Psychiatrist', `${opener} It really helped! You've overcome your ${label}.`, { emoji: '\u{1F6CB}\u{FE0F}', tone: 'good' })
      log(g, `Therapy helped me overcome my ${label}.`, 'good')
      return
    }
    notice(g, 'Psychiatrist', `${opener} You're making progress on your ${label}, but there's more work to do.`, { emoji: '\u{1F6CB}\u{FE0F}' })
    log(g, `I went to therapy for my ${label}.`)
    return
  }
  notice(g, 'Psychiatrist', `${opener} You walked out feeling lighter.`, { emoji: '\u{1F6CB}\u{FE0F}', tone: 'good' })
  log(g, 'I went to a counseling session.', 'good')
}

function shockTherapy(g: GameState): void {
  const c = g.character
  const cost = patientCost(g, Math.round(randInt(g, 400, 800) * priceFactor(g)))
  if (!canAfford(g, cost)) return tooBroke(g, 'shock therapy', cost)
  if (!useYearAction(g, 'psychiatrist', 3)) {
    notice(g, 'Shock Therapy', "You've been zapped enough this year. Your hair still hasn't recovered.", { emoji: '\u{26A1}' })
    return
  }
  spend(g, cost)
  count(g, 'doctorVisits')
  const pain = randInt(g, 10, 100)
  addStat(g, 'health', -Math.round(pain / 12))
  if (chance(g, 0.4)) addStat(g, 'smarts', -randInt(g, 1, 4))
  const mental = c.conditions.filter((x) => x.kind === 'mental').sort((a, b) => b.severity - a.severity)
  for (const x of mental) x.diagnosed = true
  const painText = `On a pain scale of 1 to 100, that was a ${pain}.`
  const target = mental[0]
  if (target && chance(g, Math.min(0.75, defFor(target).cure + 0.15))) {
    removeCondition(g, target.id)
    addStat(g, 'happiness', randInt(g, 8, 18))
    notice(g, 'Shock Therapy', `They strapped you down and flipped the switch. ${painText} But it worked: your ${conditionLabel(target.name)} is gone!`, { emoji: '\u{26A1}', tone: 'good' })
    log(g, `Shock therapy cured my ${conditionLabel(target.name)}.`, 'good')
    return
  }
  if (chance(g, 0.5)) {
    addStat(g, 'happiness', randInt(g, 5, 12))
    notice(g, 'Shock Therapy', `They strapped you down and flipped the switch. ${painText} Weirdly, you feel kind of great afterwards.`, { emoji: '\u{26A1}', tone: 'good' })
  } else {
    addStat(g, 'happiness', -randInt(g, 5, 12))
    notice(g, 'Shock Therapy', `They strapped you down and flipped the switch. ${painText} You don't feel any better. You do smell faintly of toast.`, { emoji: '\u{26A1}', tone: 'bad' })
  }
  log(g, 'I underwent shock therapy.')
}

// ---------------------------------------------------------------------------
// Witch doctor

const REMEDIES = [
  'ant droppings',
  "a bat's liver",
  'cobra venom',
  'fermented shark',
  'eye of newt',
  'leech therapy',
  'a live toad',
  'tree bark tea',
  'a dragon scale',
  'a green bubbling liquid from a cauldron',
  'whale liver',
  'a raw lizard egg',
  'a red-and-white spotted mushroom',
  'hemlock root',
  'chihuahua hair',
  'fish eyes',
  'toe of frog',
  'powdered beetle shells',
]
const DANGEROUS = new Set(['a live toad', 'hemlock root', 'a green bubbling liquid from a cauldron', 'a red-and-white spotted mushroom'])

function witchDoctor(g: GameState): void {
  const c = g.character
  const cost = Math.round(randInt(g, 40, 150) * priceFactor(g))
  if (!canAfford(g, cost)) return tooBroke(g, "the witch doctor's services", cost)
  if (!useYearAction(g, 'witchDoctor', 3)) {
    notice(g, 'Witch Doctor', 'The witch doctor is "consulting the spirits" and will not see you again this year.', { emoji: '\u{1F9D9}' })
    return
  }
  spend(g, cost)
  count(g, 'doctorVisits')
  const remedy = pick(g, REMEDIES)
  const intro = pick(g, [
    `The witch doctor chanted over you and made you swallow ${remedy}.`,
    `The witch doctor prescribed ${remedy}. You choked it down.`,
    `After shaking a rattle in your face for twenty minutes, the witch doctor gave you ${remedy}.`,
  ])
  let deathChance = 0.015 + yearActionsUsed(g, 'witchDoctor') * 0.01 + (c.stats.health < 25 ? 0.05 : 0) + (DANGEROUS.has(remedy) ? 0.03 : 0)
  if (c.conditions.length > 0) deathChance += 0.01
  if (chance(g, deathChance)) {
    notice(g, 'Witch Doctor', `${intro} Your vision went dark almost immediately.`, { emoji: '\u{1F480}', tone: 'bad' })
    killCharacter(g, 'Witch Doctor Poisoning')
    return
  }
  const conds = c.conditions.filter((x) => x.kind !== 'addiction')
  const roll = randInt(g, 1, 100)
  if (conds.length > 0 && roll <= 12) {
    const target = pick(g, conds)
    removeCondition(g, target.id)
    addStat(g, 'happiness', randInt(g, 8, 15))
    notice(g, 'Witch Doctor', `${intro} Against all medical logic, your ${conditionLabel(target.name)} is gone! The spirits have spoken.`, { emoji: '\u{1F9D9}', tone: 'good' })
    log(g, `A witch doctor cured my ${conditionLabel(target.name)}. Somehow.`, 'good')
    return
  }
  if (roll <= 45) {
    addStat(g, 'health', -randInt(g, 5, 20))
    addStat(g, 'happiness', -randInt(g, 3, 10))
    if (chance(g, 0.4)) addStat(g, 'smarts', -randInt(g, 1, 5))
    notice(g, 'Witch Doctor', `${intro} You spent the next three days hugging the toilet.`, { emoji: '\u{1F922}', tone: 'bad' })
    log(g, 'I got violently ill after seeing a witch doctor.', 'bad')
    return
  }
  notice(g, 'Witch Doctor', `${intro} Nothing happened. Except you're out ${formatMoney(cost)} and you can't get the taste out of your mouth.`, { emoji: '\u{1F9D9}' })
  log(g, `I visited a witch doctor and ate ${remedy}.`)
}

// ---------------------------------------------------------------------------
// Optometrist

function optometrist(g: GameState): void {
  const examCost = patientCost(g, Math.round(randInt(g, 60, 150) * priceFactor(g)))
  if (!canAfford(g, examCost)) return tooBroke(g, 'an eye exam', examCost)
  if (!useYearAction(g, 'optometrist', 2)) {
    notice(g, 'Optometrist', "You've had your eyes checked enough this year. They're not going anywhere.", { emoji: '\u{1F441}\u{FE0F}' })
    return
  }
  spend(g, examCost)
  count(g, 'doctorVisits')
  if (g.flags.eyesight !== 'poor') {
    addStat(g, 'happiness', 4)
    const perfect = g.character.countryId === 'us' ? 'Your vision is a perfect 20/20.' : 'Your vision is perfect.'
    notice(g, 'Optometrist', pick(g, [`${perfect} The optometrist tried to sell you designer frames anyway.`, 'You read the bottom line of the chart with ease. Eagle eyes!']), { emoji: '\u{1F441}\u{FE0F}', tone: 'good' })
    log(g, 'I aced my eye exam.', 'good')
    return
  }
  const pf = priceFactor(g)
  const glassesCost = patientCost(g, Math.round(randInt(g, 100, 300) * pf), false)
  const contactsCost = patientCost(g, Math.round(randInt(g, 150, 350) * pf), false)
  const lasikCost = patientCost(g, Math.round(randInt(g, 2000, 4500) * pf), false)
  const current = typeof g.flags.eyewear === 'string' ? g.flags.eyewear : null
  scriptChoice(
    g,
    GLASSES,
    'Optometrist',
    `${current ? `Your ${current.toLowerCase()} need a new prescription.` : 'Your vision is blurrier than you thought.'} What would you like to do?`,
    [
      ...FRAMES.map((f) => ({ ...f, label: `${f.label} (${formatMoney(glassesCost)})` })),
      { id: 'contacts', label: `Contact lenses (${formatMoney(contactsCost)})`, emoji: '\u{1F441}\u{FE0F}' },
      { id: 'lasik', label: `Laser eye surgery (${formatMoney(lasikCost)})`, emoji: '\u{1F526}' },
      { id: 'none', label: 'No thanks', emoji: '\u{1F6B6}' },
    ],
    { emoji: '\u{1F453}', data: { glassesCost, contactsCost, lasikCost } },
  )
}

// ---------------------------------------------------------------------------
// Blood & plasma

/** Countries that measure blood donations in pints. */
const PINT_COUNTRIES = new Set(['us', 'gb', 'ie'])
/** Countries where plasma centers pay donors; elsewhere donating is unpaid. */
const PAID_PLASMA = new Set(['us', 'de', 'at', 'cz', 'hu'])

function donateBlood(g: GameState): void {
  const c = g.character
  if (!useYearAction(g, 'bloodDonation', 1)) {
    notice(g, 'Blood Donation', "You've already donated blood this year. They need you to keep some for yourself.", { emoji: '\u{1FA78}' })
    return
  }
  if (c.stats.health < 30 || c.conditions.some((x) => x.kind === 'std' || defFor(x).deadly)) {
    notice(g, 'Blood Donation', 'The nurse took one look at your medical history and politely declined your blood.', { emoji: '\u{1FA78}' })
    return
  }
  count(g, 'bloodDonations')
  addHidden(g, 'karma', randInt(g, 2, 5))
  addStat(g, 'happiness', randInt(g, 2, 6))
  addStat(g, 'health', -randInt(g, 1, 3))
  notice(
    g,
    'Blood Donation',
    pick(g, [
      `You donated ${PINT_COUNTRIES.has(c.countryId) ? 'a pint' : 'half a liter'} of blood. They gave you a cookie and a sticker that says "Be nice to me, I gave blood today."`,
      'You donated blood and potentially saved a life. The free orange juice was a nice bonus.',
      'You donated blood. You felt woozy for a minute but heroic for the rest of the day.',
    ]),
    { emoji: '\u{1FA78}', tone: 'good' },
  )
  log(g, 'I donated blood.', 'good')
}

function donatePlasma(g: GameState): void {
  const c = g.character
  if (!useYearAction(g, 'plasmaDonation', 2)) {
    notice(g, 'Plasma Donation', "You've donated all the plasma you're allowed this year.", { emoji: '\u{1F489}' })
    return
  }
  if (c.stats.health < 30 || c.conditions.some((x) => x.kind === 'std' || defFor(x).deadly)) {
    notice(g, 'Plasma Donation', 'The plasma center turned you away after reading your medical history.', { emoji: '\u{1F489}' })
    return
  }
  if (!PAID_PLASMA.has(c.countryId)) {
    // Most countries don't pay for plasma: it's a good deed, not a side hustle.
    count(g, 'plasmaDonations')
    addHidden(g, 'karma', randInt(g, 2, 5))
    addStat(g, 'happiness', randInt(g, 2, 5))
    addStat(g, 'health', -randInt(g, 1, 3))
    notice(
      g,
      'Plasma Donation',
      pick(g, [
        "You donated plasma. Nobody gets paid for it here, so all you walked away with was a juice box and a warm, slightly lightheaded feeling.",
        'You hoped to sell your plasma, but here donations are strictly voluntary. You donated anyway. Look at you, being a good person.',
      ]),
      { emoji: '\u{1F489}', tone: 'good' },
    )
    log(g, 'I donated plasma.', 'good')
    return
  }
  const pay = Math.max(10, Math.round(randInt(g, 35, 60) * priceFactor(g)))
  addMoney(g, pay)
  count(g, 'plasmaDonations')
  addHidden(g, 'karma', randInt(g, 1, 3))
  addStat(g, 'health', -randInt(g, 1, 3))
  notice(g, 'Plasma Donation', pick(g, [`You donated plasma and walked out ${formatMoney(pay)} richer and slightly lightheaded.`, `You sold a bag of your plasma for ${formatMoney(pay)}. Your body is a renewable resource.`]), {
    emoji: '\u{1F489}',
    tone: 'good',
  })
  log(g, `I donated plasma for ${formatMoney(pay)}.`, 'good')
}

// ---------------------------------------------------------------------------
// Menu

function conditionSummary(g: GameState): string {
  const c = g.character
  const known = c.conditions.filter((x) => x.diagnosed)
  const hidden = c.conditions.some((x) => !x.diagnosed)
  const parts: string[] = []
  parts.push(`Health: ${c.stats.health}%`)
  if (known.length > 0) parts.push(`Diagnosed: ${known.map((x) => x.name).join(', ')}`)
  else parts.push(hidden ? "You don't feel quite right, but nothing has been diagnosed." : "You haven't been diagnosed with anything.")
  if (typeof g.flags.eyewear === 'string') parts.push(`Eyewear: ${g.flags.eyewear}`)
  return parts.join(' \u{2022} ')
}

const medicalDoctorMenu: MenuGroup = {
  type: 'menu',
  id: 'doctor.medical',
  label: 'Doctor',
  emoji: '\u{1FA7A}',
  subtitle: 'Seek western medicine',
  disabledReason: (g) => aliveCheck(g) ?? (g.character.age < 4 ? "You're too young to go to the doctor on your own." : null),
  header: (g) => `Choose a doctor. ${conditionSummary(g)}`,
  children: (g) =>
    medicalDoctors(g).map(
      (doc, i): MenuAction => ({
        type: 'action',
        id: `doctor.medical.${i}`,
        label: doc.title.startsWith('the ') ? cap(doc.title) : doc.title,
        emoji: i === 0 ? '\u{1F468}\u{200D}\u{2695}\u{FE0F}' : '\u{1F469}\u{200D}\u{2695}\u{FE0F}',
        subtitle: (s) => `Reputation ${stars(doc.quality)} \u{2022} Consultation: ${priceLabel(s, patientCost(s, doc.fee))}`,
        run: (draft) => visitDoctor(draft, doc),
      }),
    ),
}

const altDoctorMenu: MenuGroup = {
  type: 'menu',
  id: 'doctor.alternative',
  label: 'Alternative Doctor',
  emoji: '\u{1F33F}',
  subtitle: 'Seek alternative medicine',
  disabledReason: adultOnly('see an alternative doctor'),
  children: () =>
    ALT_DOCTORS.map(
      (alt): MenuAction => ({
        type: 'action',
        id: `doctor.alternative.${alt.id}`,
        label: alt.label,
        emoji: alt.emoji,
        subtitle: (g) => `${alt.subtitle} \u{2022} ${priceLabel(g, altPrice(g, alt))}`,
        run: (g) => visitAlt(g, alt),
      }),
    ),
}

const psychiatristMenu: MenuGroup = {
  type: 'menu',
  id: 'doctor.psychiatrist',
  label: 'Psychiatrist',
  emoji: '\u{1F6CB}\u{FE0F}',
  subtitle: 'Visit a shrink',
  disabledReason: adultOnly('see a psychiatrist'),
  header: (g) => {
    const mental = g.character.conditions.filter((x) => x.kind === 'mental' && x.diagnosed)
    return mental.length > 0 ? `You're dealing with: ${mental.map((x) => x.name).join(', ')}` : 'Talk it out, or try something more... electrifying.'
  },
  children: () => [
    {
      type: 'action',
      id: 'doctor.psychiatrist.counseling',
      label: 'Counseling Session',
      emoji: '\u{1F5E3}\u{FE0F}',
      subtitle: 'Talk about your feelings',
      run: counseling,
    },
    {
      type: 'action',
      id: 'doctor.psychiatrist.shock',
      label: 'Shock Therapy',
      emoji: '\u{26A1}',
      subtitle: 'Electroconvulsive therapy',
      confirm: () => 'Are you sure you want to undergo shock therapy? It can hurt. A lot.',
      run: shockTherapy,
    },
  ],
}

const prisonDoctor: MenuAction = {
  type: 'action',
  id: 'doctor.prison',
  label: 'Prison Doctor',
  emoji: '\u{1FA7A}',
  subtitle: 'Visit the infirmary',
  disabledReason: aliveCheck,
  run: (g) => visitDoctor(g, medicalDoctors(g)[0]),
}

export const doctorMenu: MenuGroup = {
  type: 'menu',
  id: 'doctor',
  label: 'Doctor',
  emoji: '\u{1FA7A}',
  subtitle: (g) => (inPrison(g) ? 'Visit the prison infirmary' : 'Visit the doctor'),
  visible: (g) => g.character.alive,
  disabledReason: (g) => aliveCheck(g) ?? (g.character.age < 4 ? "You're too young to go to the doctor on your own. Your parents take you when you're sick." : null),
  header: conditionSummary,
  children: (g): MenuNode[] => {
    if (inPrison(g)) return [prisonDoctor]
    return [
      altDoctorMenu,
      medicalDoctorMenu,
      {
        type: 'action',
        id: 'doctor.blood',
        label: 'Donate Blood',
        emoji: '\u{1FA78}',
        subtitle: 'Make a blood donation',
        disabledReason: adultOnly('donate blood'),
        run: donateBlood,
      },
      {
        type: 'action',
        id: 'doctor.plasma',
        label: 'Donate Plasma',
        emoji: '\u{1F489}',
        subtitle: 'Make a plasma donation',
        disabledReason: adultOnly('donate plasma'),
        run: donatePlasma,
      },
      {
        type: 'action',
        id: 'doctor.er',
        label: 'Emergency Room',
        emoji: '\u{1F3E5}',
        subtitle: 'Visit the emergency room',
        disabledReason: (s) => aliveCheck(s) ?? (s.character.age < 4 ? "You're too young to go on your own." : null),
        run: emergencyRoom,
      },
      {
        type: 'action',
        id: 'doctor.optometrist',
        label: 'Optometrist',
        emoji: '\u{1F453}',
        subtitle: 'Visit the optometrist',
        disabledReason: adultOnly('book your own eye exam'),
        run: optometrist,
      },
      psychiatristMenu,
      {
        type: 'action',
        id: 'doctor.witch',
        label: 'Witch Doctor',
        emoji: '\u{1F9D9}',
        subtitle: 'Seek the last resort',
        disabledReason: adultOnly('see a witch doctor'),
        run: witchDoctor,
      },
    ]
  },
}
