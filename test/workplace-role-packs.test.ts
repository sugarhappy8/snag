import { describe, expect, it } from 'vitest'
import { ALL_JOBS } from '../src/game/data/jobs'
import { EARLY_FULLTIME_JOBS, EARLY_PARTTIME_JOBS } from '../src/game/history/events-jobs'
import {
  assignmentTemplatesForJob,
  ROLE_WORK_FAMILY,
  WORK_FAMILIES,
  workFamilyForJobId,
} from '../src/game/workplace/catalog'

const ALL_REGULAR_JOBS = [...ALL_JOBS, ...EARLY_FULLTIME_JOBS, ...EARLY_PARTTIME_JOBS]

describe('ordinary-career role packs', () => {
  it('gives all 249 regular jobs valid, compact assignment packs', () => {
    expect(ALL_REGULAR_JOBS).toHaveLength(249)
    expect(new Set(ALL_REGULAR_JOBS.map((job) => job.id)).size).toBe(249)
    expect(Object.keys(WORK_FAMILIES)).toHaveLength(9)
    for (const job of ALL_REGULAR_JOBS) {
      const family = workFamilyForJobId(job.id)
      expect(family, job.id).toBeDefined()
      expect(Object.keys(WORK_FAMILIES), job.id).toContain(family)
      const pack = assignmentTemplatesForJob(job.id)!
      expect(pack.length, job.id).toBeGreaterThanOrEqual(3)
      expect(pack.length, job.id).toBeLessThanOrEqual(4)
      expect(new Set(pack.map((item) => item.id)).size, job.id).toBe(pack.length)
      for (const item of pack) {
        expect(item.id, job.id).toMatch(/^[a-z]+\.[a-z]+$/)
        expect(Number.isInteger(item.difficulty), item.id).toBe(true)
        expect(item.difficulty, item.id).toBeGreaterThanOrEqual(1)
        expect(item.difficulty, item.id).toBeLessThanOrEqual(5)
        expect(item.title.length, item.id).toBeGreaterThan(5)
        expect(item.title.length, item.id).toBeLessThan(60)
        for (const outcome of [item.success, item.failure]) {
          expect(outcome.length, item.id).toBeGreaterThan(15)
          expect(outcome.length, item.id).toBeLessThan(120)
        }
      }
    }
  })

  it.each([
    ['pharmacist', 'care', 'pharmacy'],
    ['veterinarian', 'care', 'vet'],
    ['biotechnologist', 'technical', 'research'],
    ['microbiologist', 'technical', 'research'],
    ['environmental_scientist', 'technical', 'environment'],
    ['marine_biologist', 'technical', 'environment'],
    ['pt_research_assistant', 'technical', 'research'],
    ['pt_lab_assistant', 'technical', 'lab'],
    ['archaeologist', 'technical', 'archaeology'],
    ['curator', 'creative', 'curator'],
    ['history_teacher', 'education', 'history'],
    ['reporter', 'creative', 'reporter'],
    ['blacksmith', 'field', 'craft'],
    ['cobbler', 'field', 'craft'],
    ['wheelwright', 'field', 'craft'],
    ['tailor', 'field', 'tailor'],
    ['jeweler', 'field', 'jeweler'],
    ['farmer', 'field', 'farm'],
    ['pt_farm_chores', 'field', 'farm'],
    ['fisherman', 'field', 'fishery'],
    ['crab_fisherman', 'field', 'fishery'],
    ['beekeeper', 'field', 'bees'],
    ['horse_jockey', 'field', 'jockey'],
  ])('%s has a fitting family and role-specific work', (jobId, family, prefix) => {
    expect(workFamilyForJobId(jobId)).toBe(family)
    const pack = assignmentTemplatesForJob(jobId)!
    expect(pack).toHaveLength(4)
    expect(pack.every((item) => item.id.startsWith(`${prefix}.`))).toBe(true)
    // These shared historical roles must never require modern communications or equipment.
    const text = pack.map((item) => `${item.title} ${item.success} ${item.failure}`).join(' ')
    expect(text).not.toMatch(/\b(smartphone|internet|email|online|digital|laser|computer|app|software)\b/i)
  })

  it.each([
    ['pt_school_bus', 'transport'], ['pt_paperboy', 'transport'], ['pt_delivery_boy', 'transport'],
    ['pt_courier_app', 'transport'], ['pt_valet', 'transport'],
    ['pt_mover', 'field'], ['pt_pool_cleaner', 'field'], ['pt_window_cleaner', 'field'],
    ['pt_bike_mechanic', 'field'], ['pt_street_sweeper', 'field'],
    ['pt_cafeteria', 'service'], ['pt_cinema_ice', 'service'], ['pt_beverage_cart', 'service'],
    ['pt_swim', 'education'], ['pt_fitness', 'education'], ['pt_trainer', 'education'],
    ['pt_camp_counselor', 'education'], ['pt_admissions', 'office'], ['pt_lifeguard', 'civic'],
    ['pt_social_media', 'creative'], ['massage_therapist', 'care'],
  ])('maps mixed-industry role %s to %s', (jobId, family) => {
    expect(workFamilyForJobId(jobId)).toBe(family)
  })

  it('keeps explicit role mappings tied to real definitions', () => {
    const ids = new Set(ALL_REGULAR_JOBS.map((job) => job.id))
    for (const id of Object.keys(ROLE_WORK_FAMILY)) expect(ids.has(id), id).toBe(true)
    expect(assignmentTemplatesForJob('not_a_job')).toBeUndefined()
    expect(workFamilyForJobId('not_a_job')).toBeUndefined()
  })
})
