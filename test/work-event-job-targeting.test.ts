import { describe, expect, it } from 'vitest'
import { eventEligible } from '../src/game/events'
import { EVENT_SCRIPT, present, type EventDef } from '../src/game/events/helpers'
import { WORK_EVENTS } from '../src/game/events/work'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, Job, JobCategory } from '../src/game/types'
import { makeTestGame } from './helpers'

function job(category: JobCategory, overrides: Partial<Job> = {}): Job {
  return {
    defId: `${category}.test`,
    title: category === 'parttime' ? 'Cafe Server' : 'Test Career',
    company: `${category} employer`,
    category,
    salary: 40_000,
    level: 0,
    performance: 60,
    yearsInRole: 1,
    yearsAtCompany: 1,
    data: {},
    ...overrides,
  }
}

function workEvent(id: string): EventDef {
  const event = WORK_EVENTS.find((candidate) => candidate.id === id)
  if (!event) throw new Error(`missing work event ${id}`)
  return event
}

function show(g: GameState, event: EventDef): ChoiceModal {
  const setup = event.setup(g)
  if (!setup) throw new Error(`${event.id} was not presentable`)
  present(g, event, setup)
  const modal = g.queue.at(-1)
  if (!modal || modal.kind !== 'choice') throw new Error(`${event.id} did not queue a choice`)
  return modal
}

describe('work event job targeting', () => {
  it('preserves the established special-career event target when no regular side job exists', () => {
    const g = makeTestGame(19, { age: 30 })
    g.character.job = job('special', { title: 'Actor', company: 'Silver Screen Studio', performance: 70 })

    const event = workEvent('work.teamBuilding')
    expect(eventEligible(g, event)).toBe(true)
    const modal = show(g, event)

    expect(modal.text).toContain('Silver Screen Studio')
    expect(modal.data).toMatchObject({ workSlot: 'job' })
    expect(g.character.job.data.appointmentId).toBeUndefined()

    runScript(g, EVENT_SCRIPT, 'no', modal.data, modal)
    expect(g.character.job.performance).toBe(64)
  })

  it('does not apply a queued special-career event to a different special career', () => {
    const g = makeTestGame(21, { age: 30 })
    g.character.job = job('special', { defId: 'actor', title: 'Actor', company: 'Silver Screen Studio', performance: 70 })
    const modal = show(g, workEvent('work.teamBuilding'))

    g.character.job = job('special', {
      defId: 'actor',
      title: 'Actor',
      company: 'Silver Screen Studio',
      performance: 81,
      data: { appointmentId: 'new-special-appointment' },
    })
    runScript(g, EVENT_SCRIPT, 'no', modal.data, modal)

    expect(g.character.job.performance).toBe(81)
  })

  it('uses the part-time employer, person and performance when a special career is the main job', () => {
    const g = makeTestGame(23, { age: 30 })
    g.character.job = job('special', { title: 'Actor', company: 'Silver Screen Studio', performance: 83 })
    const partTime = job('parttime', { defId: 'barista', title: 'Barista', company: 'Moonlight Cafe', performance: 60 })
    const supervisor = createPerson(g, {
      relation: 'boss',
      firstName: 'Pia',
      age: 42,
      relationship: 50,
      contextId: partTime.company,
    })
    partTime.bossId = supervisor.id
    g.character.partTimeJob = partTime

    const event = workEvent('work.teamBuilding')
    expect(eventEligible(g, event)).toBe(true)
    const modal = show(g, event)

    expect(modal.text).toContain('Pia')
    expect(modal.text).toContain('Moonlight Cafe')
    expect(modal.personId).toBe(supervisor.id)
    expect(modal.data).toMatchObject({ workSlot: 'partTimeJob' })

    runScript(g, EVENT_SCRIPT, 'no', modal.data, modal)

    expect(g.character.job?.performance).toBe(83)
    expect(g.character.partTimeJob?.performance).toBe(54)
    expect(supervisor.relationship).toBe(46)
  })

  it('does not apply a queued performance effect to a replacement appointment', () => {
    const g = makeTestGame(31, { age: 30 })
    g.character.job = job('fulltime', {
      defId: 'accountant',
      title: 'Accountant',
      company: 'Acme Corp',
      performance: 60,
      data: { appointmentId: 'appointment-old' },
    })
    const modal = show(g, workEvent('work.overtime'))
    expect(modal.data).toMatchObject({ workSlot: 'job' })

    g.character.job = job('fulltime', {
      defId: 'accountant',
      title: 'Accountant',
      company: 'Acme Corp',
      performance: 37,
      data: { appointmentId: 'appointment-new' },
    })
    runScript(g, EVENT_SCRIPT, 'agree', modal.data, modal)

    expect(g.character.job.performance).toBe(37)
  })

  it('does not guess a target for a legacy queued work event without an appointment key', () => {
    const g = makeTestGame(37, { age: 30 })
    g.character.job = job('fulltime', {
      defId: 'accountant',
      title: 'Accountant',
      company: 'Acme Corp',
      performance: 60,
      data: { appointmentId: 'appointment-old' },
    })
    const modal = show(g, workEvent('work.overtime'))
    if (!modal.data || typeof modal.data !== 'object' || Array.isArray(modal.data)) throw new Error('missing event data')
    delete modal.data.workSlot
    delete modal.data.workJobKey

    g.character.job = job('fulltime', {
      defId: 'teacher',
      title: 'Teacher',
      company: 'Central School',
      performance: 48,
      data: { appointmentId: 'appointment-new' },
    })
    runScript(g, EVENT_SCRIPT, 'agree', modal.data, modal)

    expect(g.character.job.performance).toBe(48)
  })
})
