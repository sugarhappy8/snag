// Shared, era-neutral career content for ordinary jobs. The workplace engine owns
// progression and outcomes; this file only maps jobs to compact content packs.
import { getJobDef, type Industry, type JobDef } from '../data/jobs'
import { earlyJobDef } from '../history/events-jobs'

export type WorkFamily = 'office' | 'technical' | 'care' | 'civic' | 'education' | 'creative' | 'service' | 'field' | 'transport'
export type WorkApproach = 'quality' | 'speed' | 'people'

export interface AssignmentTemplate {
  id: string
  title: string
  difficulty: number
  success: string
  failure: string
}

export interface WorkFamilyDef {
  label: string
  emoji: string
  tags: string[]
  specialties: string[]
  assignments: AssignmentTemplate[]
  approaches: Record<WorkApproach, { label: string; subtitle: string }>
}

const assignment = (id: string, title: string, difficulty: number, success: string, failure: string): AssignmentTemplate => ({ id, title, difficulty, success, failure })

export const WORK_FAMILIES: Record<WorkFamily, WorkFamilyDef> = {
  office: {
    label: 'Office & Commercial', emoji: '📊', tags: ['business', 'finance'],
    specialties: ['Analysis & planning', 'Client relationships', 'Operations'],
    assignments: [
      assignment('office.process', 'Process review', 1, 'The new process held up under daily use.', 'The proposal created more work than it saved.'),
      assignment('office.client', 'Difficult client proposal', 2, 'The proposal won the client’s confidence.', 'The client chose a competing proposal.'),
      assignment('office.plan', 'Annual operating plan', 2, 'The plan gave the team a clear, workable direction.', 'The plan missed important costs and constraints.'),
      assignment('office.rollout', 'Cross-team rollout', 3, 'The rollout landed with few disruptions.', 'The rollout stalled between departments.'),
    ],
    approaches: {
      quality: { label: 'Build the case', subtitle: 'Check the figures and assumptions; safest result' },
      speed: { label: 'Hit the deadline', subtitle: 'Move quickly; more risk if details are wrong' },
      people: { label: 'Win support', subtitle: 'Coordinate stakeholders; strengthens work relationships' },
    },
  },
  technical: {
    label: 'Technical & Research', emoji: '🔬', tags: ['tech', 'science'],
    specialties: ['Reliability', 'Research', 'Systems'],
    assignments: [
      assignment('technical.fault', 'Difficult fault investigation', 2, 'The root cause was isolated and corrected.', 'The fault returned after the first fix.'),
      assignment('technical.prototype', 'Prototype evaluation', 2, 'The trial produced useful, repeatable results.', 'The trial could not support a clear conclusion.'),
      assignment('technical.process', 'Technical process improvement', 1, 'The improvement made routine work more reliable.', 'The change introduced an unexpected weakness.'),
      assignment('technical.standards', 'Standards and safety review', 3, 'The review caught risks before release.', 'A serious gap survived the review.'),
    ],
    approaches: {
      quality: { label: 'Verify every step', subtitle: 'Test carefully and document the evidence' },
      speed: { label: 'Deliver a workable fix', subtitle: 'Shorten the cycle; accept more technical risk' },
      people: { label: 'Pair with specialists', subtitle: 'Bring other disciplines into the solution' },
    },
  },
  care: {
    label: 'Care & Wellbeing', emoji: '🩺', tags: ['health', 'service', 'animals'],
    specialties: ['Direct care', 'Assessment', 'Care coordination'],
    assignments: [
      assignment('care.case', 'Complex care review', 2, 'The care plan produced a stable improvement.', 'The case needed escalation and a new plan.'),
      assignment('care.continuity', 'Continuity-of-care plan', 2, 'The handoffs kept the recipient’s care on track.', 'Important details were lost between handoffs.'),
      assignment('care.safety', 'Safety and quality check', 1, 'The check removed a preventable risk.', 'A preventable risk remained after the check.'),
      assignment('care.support', 'Family support plan', 3, 'The family understood and supported the plan.', 'The plan did not earn enough trust to hold.'),
    ],
    approaches: {
      quality: { label: 'Assess cautiously', subtitle: 'Prioritize safety, evidence and careful follow-up' },
      speed: { label: 'Clear the waiting list', subtitle: 'Help more people now; subtle problems may be missed' },
      people: { label: 'Build trust', subtitle: 'Spend time on communication and shared decisions' },
    },
  },
  civic: {
    label: 'Civic & Public Safety', emoji: '🏛️', tags: ['government', 'law', 'service'],
    specialties: ['Public administration', 'Investigation', 'Emergency response'],
    assignments: [
      assignment('civic.complaint', 'Difficult public complaint', 1, 'The complaint was resolved fairly and clearly.', 'The complaint escalated without a clear resolution.'),
      assignment('civic.safety', 'Public safety review', 2, 'The review closed a serious gap in public safety.', 'The review overlooked a practical hazard.'),
      assignment('civic.case', 'Sensitive case review', 3, 'The case held up to scrutiny.', 'The case had to be reopened after key doubts emerged.'),
      assignment('civic.community', 'Community response plan', 2, 'The plan earned cooperation from the community.', 'The plan failed to match what the community needed.'),
    ],
    approaches: {
      quality: { label: 'Follow procedure', subtitle: 'Build a defensible record and reduce mistakes' },
      speed: { label: 'Act immediately', subtitle: 'Respond fast; incomplete facts raise the risk' },
      people: { label: 'Consult the community', subtitle: 'Seek cooperation and local knowledge' },
    },
  },
  education: {
    label: 'Education & Learning', emoji: '🎓', tags: ['education', 'academic', 'service'],
    specialties: ['Instruction', 'Learner support', 'Program leadership'],
    assignments: [
      assignment('education.lesson', 'Learning program redesign', 1, 'The new material made difficult ideas clearer.', 'The new material did not improve understanding.'),
      assignment('education.support', 'Struggling learner cohort', 2, 'The cohort made steady, measurable progress.', 'The cohort needed a different support plan.'),
      assignment('education.assessment', 'Assessment review', 2, 'The review made assessment fairer and more useful.', 'The revised assessment measured the wrong things.'),
      assignment('education.community', 'Community learning program', 3, 'The program drew lasting participation.', 'The program failed to connect with its audience.'),
    ],
    approaches: {
      quality: { label: 'Plan each lesson', subtitle: 'Use careful preparation and measured progress' },
      speed: { label: 'Cover more ground', subtitle: 'Move through material quickly; some may fall behind' },
      people: { label: 'Teach through dialogue', subtitle: 'Adapt through feedback and personal support' },
    },
  },
  creative: {
    label: 'Creative & Media', emoji: '🎨', tags: ['arts', 'media', 'writing'],
    specialties: ['Storytelling', 'Production', 'Audience development'],
    assignments: [
      assignment('creative.commission', 'Feature commission', 2, 'The finished work had a clear and memorable point of view.', 'The finished work never found a clear direction.'),
      assignment('creative.deadline', 'Major production deadline', 2, 'The production arrived polished and on time.', 'The production missed its standard under deadline pressure.'),
      assignment('creative.revision', 'Difficult revision', 1, 'The revision made the work sharper without losing its character.', 'The revision weakened what made the work distinctive.'),
      assignment('creative.showcase', 'Public showcase', 3, 'The showcase found an enthusiastic audience.', 'The showcase received a muted response.'),
    ],
    approaches: {
      quality: { label: 'Refine the craft', subtitle: 'Revise patiently for the strongest finished work' },
      speed: { label: 'Make the deadline', subtitle: 'Protect momentum; polish may suffer' },
      people: { label: 'Create with the audience', subtitle: 'Use collaborators and feedback to shape the work' },
    },
  },
  service: {
    label: 'Service & Hospitality', emoji: '🤝', tags: ['service', 'hospitality', 'business'],
    specialties: ['Guest service', 'Daily operations', 'Sales & presentation'],
    assignments: [
      assignment('service.rush', 'Peak-period service', 2, 'The team kept service smooth through the rush.', 'Waits and mistakes mounted during the rush.'),
      assignment('service.customer', 'Difficult customer recovery', 1, 'The customer left feeling heard and fairly treated.', 'The dispute ended without restoring the customer’s trust.'),
      assignment('service.quality', 'Quality reset', 2, 'The reset lifted consistency across the whole shift.', 'Old habits returned as soon as pressure rose.'),
      assignment('service.event', 'Large booking or event', 3, 'The event ran smoothly from arrival to close.', 'The event exposed gaps in planning and service.'),
    ],
    approaches: {
      quality: { label: 'Perfect the details', subtitle: 'Deliver consistent service even when it takes longer' },
      speed: { label: 'Keep the line moving', subtitle: 'Serve more people; mistakes become more likely' },
      people: { label: 'Read the room', subtitle: 'Prioritize rapport with guests and the team' },
    },
  },
  field: {
    label: 'Field, Craft & Operations', emoji: '🛠️', tags: ['trades', 'service'],
    specialties: ['Craft & repair', 'Safety', 'Site operations'],
    assignments: [
      assignment('field.repair', 'Difficult repair or restoration', 2, 'The work passed inspection and held up in use.', 'The work needed costly rework.'),
      assignment('field.inspection', 'Safety inspection', 1, 'The inspection caught a hazard before anyone was hurt.', 'The inspection missed a hazard on the site.'),
      assignment('field.disruption', 'Weather-disrupted operation', 3, 'The operation recovered without sacrificing safety.', 'The disruption pushed the job off course.'),
      assignment('field.improvement', 'Site improvement', 2, 'The improvement made the site safer and more productive.', 'The improvement did not survive real working conditions.'),
    ],
    approaches: {
      quality: { label: 'Measure twice', subtitle: 'Favor durable work and a clean inspection' },
      speed: { label: 'Finish the job today', subtitle: 'Work fast; rework and injury risks rise' },
      people: { label: 'Work as a crew', subtitle: 'Coordinate hands, experience and site knowledge' },
    },
  },
  transport: {
    label: 'Transport & Logistics', emoji: '🚚', tags: ['trades', 'hospitality', 'service'],
    specialties: ['Safe operation', 'Navigation', 'Dispatch & logistics'],
    assignments: [
      assignment('transport.route', 'Difficult route assignment', 2, 'The route was completed safely and on schedule.', 'The route suffered avoidable delays.'),
      assignment('transport.disruption', 'Schedule disruption', 2, 'The revised plan kept people and goods moving.', 'The disruption cascaded through the schedule.'),
      assignment('transport.safety', 'Equipment safety review', 1, 'The review found and corrected a dangerous weakness.', 'A maintenance problem escaped the review.'),
      assignment('transport.demand', 'High-demand operation', 3, 'The operation absorbed the demand without losing control.', 'Delays and handling errors overwhelmed the operation.'),
    ],
    approaches: {
      quality: { label: 'Protect the safety margin', subtitle: 'Inspect, plan and leave room for disruption' },
      speed: { label: 'Recover the schedule', subtitle: 'Make up time; a narrow margin raises risk' },
      people: { label: 'Coordinate every handoff', subtitle: 'Keep crew, dispatch and passengers informed' },
    },
  },
}

/** Every job industry has a stable default; individual mixed-industry roles may override it below. */
export const INDUSTRY_WORK_FAMILY: Record<Industry, WorkFamily> = {
  corporate: 'office', tech: 'technical', finance: 'office', bank: 'office',
  hospital: 'care', medical: 'care', dental: 'care', vet: 'care',
  law: 'civic', municipal: 'civic', police: 'civic', fire: 'civic',
  school: 'education', university: 'education', library: 'education',
  airline: 'transport', rideshare: 'transport', trucking: 'transport',
  newspaper: 'creative', publisher: 'creative', film: 'creative', record: 'creative', design: 'creative', circus: 'creative', museum: 'creative',
  restaurant: 'service', fastfood: 'service', retail: 'service', grocery: 'service', salon: 'service', smallbiz: 'service', realestate: 'office', travel: 'service', mortuary: 'care', church: 'civic', casino: 'service', gym: 'service', hotel: 'service', mall: 'service', pool: 'service', cafe: 'service', nightclub: 'service',
  trades: 'field', fishery: 'field', farm: 'field', science: 'technical', factory: 'field',
}

/** Industries such as municipal and small business contain roles with very different work. */
export const ROLE_WORK_FAMILY: Readonly<Partial<Record<string, WorkFamily>>> = {
  translator: 'creative', social_media_manager: 'creative', sculptor: 'creative', archaeologist: 'technical',
  janitor: 'field', waste_collector: 'field', roadkill_remover: 'field', lamplighter: 'field',
  landscaper: 'field', lumberjack: 'field', chimney_sweep: 'field', blacksmith: 'field', cobbler: 'field', wheelwright: 'field', porta_potty: 'field', tailor: 'field', jeweler: 'field', horse_jockey: 'field', moonshiner: 'field',
  mail_carrier: 'transport', bus_driver: 'transport', telegram_messenger: 'transport', railway_porter: 'transport', tram_conductor: 'transport', bus_conductor: 'transport', ticket_collector: 'transport', postal_clerk: 'transport', telegraph_operator: 'transport', iceman: 'transport', milkman: 'transport', elevator_operator: 'transport', lift_attendant: 'transport',
  private_investigator: 'civic', security_guard: 'civic', mall_cop: 'civic',
  dance_instructor: 'education', pt_dance: 'education', school_psychologist: 'care',
  baker: 'service', wedding_planner: 'service', cinema_usher: 'service', water_slide_tester: 'service',
  zookeeper: 'care', cat_consultant: 'care',
  massage_therapist: 'care',
  pt_lab_assistant: 'technical', pt_research_assistant: 'technical',
  pt_social_media: 'creative',
  pt_school_bus: 'transport', pt_paperboy: 'transport', pt_delivery_boy: 'transport', pt_courier_app: 'transport', pt_valet: 'transport',
  pt_mover: 'field', pt_pool_cleaner: 'field', pt_window_cleaner: 'field', pt_bike_mechanic: 'field', pt_street_sweeper: 'field',
  pt_cafeteria: 'service', pt_cinema_ice: 'service', pt_beverage_cart: 'service',
  pt_swim: 'education', pt_fitness: 'education', pt_trainer: 'education', pt_camp_counselor: 'education',
  pt_admissions: 'office', pt_lifeguard: 'civic',
}

/** Jobs already served by Professional Practice; the shared workplace layer must not duplicate them. */
export const PROFESSIONAL_JOB_IDS: ReadonlySet<string> = new Set([
  'family_physician', 'brain_surgeon', 'psychiatrist', 'dentist', 'nurse',
  'lawyer',
  'engineer', 'chemical_engineer', 'mechanical_engineer', 'architect',
  'electrician', 'plumber', 'carpenter', 'auto_mechanic',
])

const accountantAssignments: AssignmentTemplate[] = [
  assignment('accountant.close', 'Difficult ledger close', 2, 'The accounts reconciled with a clear audit trail.', 'Unresolved differences delayed the close.'),
  assignment('accountant.discrepancy', 'Audit discrepancy investigation', 3, 'The discrepancy was traced and documented.', 'The discrepancy remained unexplained.'),
  assignment('accountant.forecast', 'Budget and cash forecast', 2, 'The forecast gave leaders a credible range for the year.', 'The forecast missed a material pressure on cash.'),
  assignment('accountant.controls', 'Financial controls review', 1, 'The review strengthened a weak control.', 'The review failed to close a control gap.'),
]

const softwareAssignments: AssignmentTemplate[] = [
  assignment('software.defect', 'Persistent defect investigation', 2, 'The underlying defect was fixed without a regression.', 'The fix moved the failure somewhere else.'),
  assignment('software.migration', 'System migration', 3, 'The system moved with its records intact.', 'The migration caused a disruptive rollback.'),
  assignment('software.performance', 'Performance bottleneck', 2, 'The bottleneck was removed and measured.', 'The change added complexity without a clear gain.'),
  assignment('software.workflow', 'User workflow release', 1, 'The release made a common task simpler and more reliable.', 'Users struggled with the changed workflow.'),
]

const teacherAssignments: AssignmentTemplate[] = [
  assignment('teacher.unit', 'Challenging lesson unit', 2, 'The class grasped the difficult material.', 'The unit left too many pupils confused.'),
  assignment('teacher.support', 'Struggling pupil group', 3, 'The pupils made steady progress with targeted support.', 'The support plan did not reach the pupils who needed it.'),
  assignment('teacher.assessment', 'Assessment redesign', 1, 'The new assessment measured learning more fairly.', 'The assessment rewarded recall more than understanding.'),
  assignment('teacher.community', 'School community program', 2, 'Families and pupils sustained the program.', 'The program never built enough participation.'),
]

const policeAssignments: AssignmentTemplate[] = [
  assignment('police.patrol', 'Community patrol plan', 1, 'The patrol reduced problems without damaging trust.', 'The patrol displaced problems without resolving them.'),
  assignment('police.evidence', 'Critical evidence handoff', 2, 'The evidence remained complete and usable.', 'A gap in the handoff weakened the case.'),
  assignment('police.traffic', 'Traffic safety operation', 2, 'The operation improved safety with few complaints.', 'The operation caused disruption without improving safety.'),
  assignment('police.incident', 'High-risk incident response', 3, 'The incident ended without avoidable harm.', 'The response drew a serious procedural review.'),
]

const detectiveAssignments: AssignmentTemplate[] = [
  assignment('detective.lead', 'Cold lead review', 2, 'A neglected detail opened a credible new lead.', 'The review produced no lead that held up.'),
  assignment('detective.witness', 'Conflicting witness accounts', 2, 'The contradictions resolved into a reliable account.', 'The contradictions left the case less certain.'),
  assignment('detective.timeline', 'Evidence chronology', 1, 'The chronology exposed the case’s decisive gap.', 'The chronology could not reconcile key evidence.'),
  assignment('detective.inquiry', 'Complex joint inquiry', 3, 'The inquiry built a case that survived scrutiny.', 'Poor coordination weakened the inquiry.'),
]

const firefighterAssignments: AssignmentTemplate[] = [
  assignment('fire.prevention', 'Fire prevention inspection', 1, 'The inspection removed a serious hazard.', 'A serious hazard escaped the inspection.'),
  assignment('fire.drill', 'Complex rescue drill', 2, 'The crew completed the drill safely and efficiently.', 'The drill exposed unresolved gaps in coordination.'),
  assignment('fire.hazard', 'Hazardous incident plan', 2, 'The plan gave every crew member a safe role.', 'The plan left a dangerous ambiguity.'),
  assignment('fire.response', 'Major emergency response', 3, 'The response contained the emergency without avoidable harm.', 'The response required a difficult operational review.'),
]

const pilotAssignments: AssignmentTemplate[] = [
  assignment('pilot.route', 'Difficult route briefing', 1, 'The flight followed a safe, efficient plan.', 'The briefing missed a costly constraint.'),
  assignment('pilot.weather', 'Weather diversion plan', 3, 'The diversion kept the flight safe and controlled.', 'The late diversion caused avoidable disruption.'),
  assignment('pilot.training', 'Safety training flight', 2, 'The crew handled every scenario to standard.', 'The exercise exposed a weakness that needed retraining.'),
  assignment('pilot.turnaround', 'Disrupted service recovery', 2, 'The service recovered without eroding the safety margin.', 'Schedule pressure continued to compound delays.'),
]

const chefAssignments: AssignmentTemplate[] = [
  assignment('chef.menu', 'Seasonal menu', 2, 'The menu was distinctive, practical and well received.', 'The menu was costly and uneven in service.'),
  assignment('chef.rush', 'Demanding dinner service', 2, 'The kitchen held quality through the rush.', 'Timing and consistency broke down during the rush.'),
  assignment('chef.waste', 'Kitchen waste reduction', 1, 'Waste fell without shrinking portions or quality.', 'The changes saved little and frustrated the brigade.'),
  assignment('chef.banquet', 'Major banquet', 3, 'Every course reached the room on time.', 'The banquet exposed gaps in preparation and timing.'),
]

const reporterAssignments: AssignmentTemplate[] = [
  assignment('reporter.investigation', 'Public-interest investigation', 3, 'The investigation revealed a story that held up to challenge.', 'The evidence could not support publication.'),
  assignment('reporter.breaking', 'Breaking news assignment', 2, 'The report was both fast and accurate.', 'The rush introduced a damaging error.'),
  assignment('reporter.sources', 'Source corroboration', 1, 'Independent sources confirmed the central claim.', 'The central claim remained too weak to run.'),
  assignment('reporter.profile', 'Long-form profile', 2, 'The profile captured its subject with depth and fairness.', 'The profile never moved beyond a surface account.'),
]

const pharmacistAssignments: AssignmentTemplate[] = [
  assignment('pharmacy.review', 'Complex prescription review', 3, 'The review caught a prescribing concern before dispensing.', 'An unresolved concern required another review.'),
  assignment('pharmacy.counsel', 'Patient counselling session', 1, 'The patient could explain how to use the medicine safely.', 'The instructions needed a clearer explanation.'),
  assignment('pharmacy.supply', 'Medicine supply shortage', 2, 'Coordination with prescribers kept treatment on track.', 'The shortage caused delays despite follow-up.'),
  assignment('pharmacy.storage', 'Dispensary quality check', 2, 'The check corrected a storage and labelling weakness.', 'A record mismatch delayed the quality sign-off.'),
]

const veterinarianAssignments: AssignmentTemplate[] = [
  assignment('vet.case', 'Animal health assessment', 2, 'Careful observations supported a sound treatment plan.', 'The findings needed further investigation.'),
  assignment('vet.herd', 'Herd health review', 3, 'The review improved monitoring and prevented avoidable illness.', 'Gaps in the records left important risks unresolved.'),
  assignment('vet.recovery', 'Recovery and owner guidance', 1, 'The owner followed the plan and reported steady recovery.', 'Unclear guidance led to a missed follow-up.'),
  assignment('vet.urgent', 'Urgent animal care handoff', 2, 'The next team received a clear history and care plan.', 'Missing details delayed the next stage of care.'),
]

const researchAssignments: AssignmentTemplate[] = [
  assignment('research.design', 'Study design review', 2, 'The study answered a focused question with suitable controls.', 'Unclear methods weakened the study before work began.'),
  assignment('research.repeat', 'Unexpected finding replication', 3, 'Independent trials confirmed a useful finding.', 'The finding did not hold up under repeat testing.'),
  assignment('research.records', 'Research record audit', 1, 'The records made the work traceable and reproducible.', 'Missing observations left a gap in the evidence.'),
  assignment('research.report', 'Evidence review and report', 2, 'The report distinguished solid findings from uncertainty.', 'The conclusions reached beyond the available evidence.'),
]

const labAssignments: AssignmentTemplate[] = [
  assignment('lab.preparation', 'Sample preparation run', 1, 'The samples reached the next stage clearly labelled and intact.', 'A labelling mismatch required the run to be checked.'),
  assignment('lab.control', 'Quality control check', 2, 'The check found a problem before results were reported.', 'Inconsistent controls meant the work had to be repeated.'),
  assignment('lab.equipment', 'Equipment care and calibration', 2, 'The equipment produced consistent measurements.', 'The measurements remained too uneven for use.'),
  assignment('lab.handoff', 'Research sample handoff', 1, 'The team received complete records with every sample.', 'An incomplete record delayed the investigation.'),
]

const environmentAssignments: AssignmentTemplate[] = [
  assignment('environment.survey', 'Habitat condition survey', 2, 'The survey established a useful picture of local conditions.', 'Gaps in coverage limited the survey’s conclusions.'),
  assignment('environment.samples', 'Field sampling campaign', 2, 'The samples and records supported reliable comparisons.', 'Uneven sampling made the results hard to compare.'),
  assignment('environment.change', 'Unexplained ecological change', 3, 'The investigation identified a credible cause for follow-up.', 'The evidence could not separate the possible causes.'),
  assignment('environment.report', 'Conservation findings briefing', 1, 'The briefing made the findings useful to local decision-makers.', 'The recommendations did not fit local conditions.'),
]

const archaeologyAssignments: AssignmentTemplate[] = [
  assignment('archaeology.survey', 'Site survey and recording', 1, 'The records preserved the site’s layout and context.', 'Missing measurements weakened the site record.'),
  assignment('archaeology.excavation', 'Fragile find excavation', 3, 'The find was recovered with its context intact.', 'Uncertain context limited what the find could reveal.'),
  assignment('archaeology.catalogue', 'Finds catalogue review', 2, 'The catalogue linked each object to a reliable record.', 'Conflicting labels required the collection to be checked.'),
  assignment('archaeology.interpret', 'Competing site interpretations', 2, 'The interpretation acknowledged both evidence and uncertainty.', 'The argument relied too heavily on an unsupported assumption.'),
]

const curatorAssignments: AssignmentTemplate[] = [
  assignment('curator.provenance', 'Object provenance review', 3, 'The review clarified the object’s history and open questions.', 'Gaps in the record prevented a confident attribution.'),
  assignment('curator.exhibit', 'Historical exhibit narrative', 2, 'The exhibit made the evidence accessible without oversimplifying it.', 'The narrative obscured important context.'),
  assignment('curator.condition', 'Collection condition survey', 1, 'The survey identified objects needing conservation attention.', 'An incomplete record delayed conservation priorities.'),
  assignment('curator.loan', 'Collection loan preparation', 2, 'The objects travelled with complete records and suitable protection.', 'A documentation gap delayed the loan.'),
]

const historyTeacherAssignments: AssignmentTemplate[] = [
  assignment('history.sources', 'Conflicting historical sources', 2, 'Pupils learned to compare sources and explain their limits.', 'The lesson left opinion and evidence too easily confused.'),
  assignment('history.chronology', 'Historical change lesson', 1, 'The class connected events to their wider context.', 'The class remembered dates without understanding the changes.'),
  assignment('history.inquiry', 'Local history investigation', 3, 'Pupils built careful arguments from the surviving records.', 'The project produced claims the records could not support.'),
  assignment('history.assessment', 'Evidence-based essay review', 2, 'The feedback improved pupils’ use of evidence.', 'The marking did not make the next learning step clear.'),
]

const craftAssignments: AssignmentTemplate[] = [
  assignment('craft.material', 'Material and tool inspection', 1, 'The inspection caught a flaw before work began.', 'An overlooked flaw forced part of the work to be repeated.'),
  assignment('craft.repair', 'Worn item restoration', 2, 'The repair restored reliable everyday use.', 'The repair failed its final fit and strength check.'),
  assignment('craft.order', 'Made-to-measure commission', 3, 'The finished piece matched the agreed measurements.', 'The finished piece needed a substantial adjustment.'),
  assignment('craft.batch', 'Consistent production batch', 2, 'The batch kept a dependable fit and finish.', 'Uneven workmanship meant several pieces needed rework.'),
]

const tailorAssignments: AssignmentTemplate[] = [
  assignment('tailor.fitting', 'Difficult garment fitting', 2, 'The alterations gave the garment a comfortable, balanced fit.', 'The garment needed another fitting before delivery.'),
  assignment('tailor.pattern', 'Custom pattern preparation', 3, 'The pattern translated the measurements into a clean silhouette.', 'The pattern wasted cloth and needed correction.'),
  assignment('tailor.repair', 'Delicate garment repair', 1, 'The repair strengthened the fabric without spoiling its appearance.', 'The repair remained visible and needed refinement.'),
  assignment('tailor.order', 'Matching garment order', 2, 'The garments arrived with consistent sizing and finish.', 'Uneven seams delayed part of the order.'),
]

const jewelerAssignments: AssignmentTemplate[] = [
  assignment('jeweler.setting', 'Delicate stone setting', 3, 'The setting held securely with a clean finish.', 'The setting needed adjustment before it could be trusted.'),
  assignment('jeweler.repair', 'Heirloom jewellery repair', 2, 'The repair restored strength while preserving the piece’s character.', 'The worn piece needed more work than the first inspection suggested.'),
  assignment('jeweler.inspect', 'Material and hallmark check', 1, 'The inspection produced a clear, accurate description.', 'Uncertain markings required further verification.'),
  assignment('jeweler.commission', 'Bespoke jewellery commission', 2, 'The finished piece matched the agreed design and fit.', 'The customer requested a substantial revision.'),
]

const farmAssignments: AssignmentTemplate[] = [
  assignment('farm.rotation', 'Seasonal planting plan', 2, 'The plan matched crops to the soil and growing season.', 'The plan underestimated a soil or weather constraint.'),
  assignment('farm.harvest', 'Weather-threatened harvest', 3, 'The team brought in the crop with manageable losses.', 'Delays left too much of the crop exposed.'),
  assignment('farm.soil', 'Soil and drainage check', 1, 'The checks caught a problem before it damaged the crop.', 'A missed drainage issue slowed growth.'),
  assignment('farm.storage', 'Harvest storage preparation', 2, 'The stores kept the produce in usable condition.', 'Poor storage conditions caused avoidable spoilage.'),
]

const fisheryAssignments: AssignmentTemplate[] = [
  assignment('fishery.gear', 'Fishing gear inspection', 1, 'The gear was ready without hidden wear or weak fastenings.', 'An overlooked weakness interrupted the next trip.'),
  assignment('fishery.weather', 'Changing-weather trip plan', 3, 'The crew returned safely with the catch secured.', 'The conditions forced an early return and a smaller catch.'),
  assignment('fishery.handling', 'Catch handling and storage', 2, 'Careful handling preserved the catch’s quality.', 'Handling delays reduced the catch’s quality.'),
  assignment('fishery.grounds', 'Fishing grounds assessment', 2, 'The observations supported a productive, responsible route.', 'The chosen grounds yielded less than expected.'),
]

const beekeeperAssignments: AssignmentTemplate[] = [
  assignment('bees.inspect', 'Colony health inspection', 2, 'The inspection identified a colony needing attention.', 'An unclear record delayed the follow-up inspection.'),
  assignment('bees.harvest', 'Honey harvest preparation', 2, 'The harvest left the colonies with adequate stores.', 'Poor timing reduced the usable harvest.'),
  assignment('bees.season', 'Lean-season colony plan', 3, 'The colonies entered the lean season in good condition.', 'Several colonies needed extra support.'),
  assignment('bees.equipment', 'Hive equipment maintenance', 1, 'The repaired equipment kept the colonies well protected.', 'A missed defect required another repair.'),
]

const jockeyAssignments: AssignmentTemplate[] = [
  assignment('jockey.training', 'Horse and rider training plan', 2, 'Consistent training improved rhythm without overworking the horse.', 'The horse and rider struggled to settle into the plan.'),
  assignment('jockey.race', 'Demanding race preparation', 3, 'The ride followed a disciplined plan in a competitive field.', 'The race pace disrupted the planned ride.'),
  assignment('jockey.track', 'Track and tack assessment', 1, 'The checks supported a safe, well-prepared ride.', 'A late concern meant changing the riding plan.'),
  assignment('jockey.team', 'Trainer and stable review', 2, 'The team agreed on useful adjustments for the next ride.', 'Mixed observations left the next steps unclear.'),
]

const ROLE_ASSIGNMENTS: Readonly<Partial<Record<string, AssignmentTemplate[]>>> = {
  accountant: accountantAssignments,
  computer_programmer: softwareAssignments, app_developer: softwareAssignments, web_developer: softwareAssignments,
  database_admin: softwareAssignments, data_scientist: softwareAssignments, ml_engineer: softwareAssignments, cybersecurity: softwareAssignments,
  teacher: teacherAssignments, history_teacher: historyTeacherAssignments,
  police: policeAssignments,
  detective: detectiveAssignments,
  firefighter: firefighterAssignments,
  pilot: pilotAssignments,
  chef: chefAssignments,
  reporter: reporterAssignments,
  pharmacist: pharmacistAssignments,
  veterinarian: veterinarianAssignments,
  biotechnologist: researchAssignments, microbiologist: researchAssignments,
  pt_research_assistant: researchAssignments, pt_lab_assistant: labAssignments,
  environmental_scientist: environmentAssignments, marine_biologist: environmentAssignments,
  archaeologist: archaeologyAssignments, curator: curatorAssignments,
  blacksmith: craftAssignments, cobbler: craftAssignments, wheelwright: craftAssignments,
  tailor: tailorAssignments, jeweler: jewelerAssignments,
  farmer: farmAssignments, pt_farm_chores: farmAssignments,
  fisherman: fisheryAssignments, crab_fisherman: fisheryAssignments,
  beekeeper: beekeeperAssignments, horse_jockey: jockeyAssignments,
}

export function resolveWorkplaceJobDef(job: JobDef | string): JobDef | undefined {
  return typeof job === 'string' ? getJobDef(job) ?? earlyJobDef(job) : job
}

export function workFamilyForDef(def: JobDef): WorkFamily {
  return ROLE_WORK_FAMILY[def.id] ?? INDUSTRY_WORK_FAMILY[def.industry]
}

export function workFamilyForJobId(jobId: string): WorkFamily | undefined {
  const def = resolveWorkplaceJobDef(jobId)
  return def && workFamilyForDef(def)
}

export function workFamilyDef(family: WorkFamily): WorkFamilyDef {
  return WORK_FAMILIES[family]
}

export function assignmentTemplatesFor(def: JobDef, family: WorkFamily = workFamilyForDef(def)): AssignmentTemplate[] {
  return ROLE_ASSIGNMENTS[def.id] ?? WORK_FAMILIES[family].assignments
}

export function assignmentTemplatesForJob(job: JobDef | string): AssignmentTemplate[] | undefined {
  const def = resolveWorkplaceJobDef(job)
  return def && assignmentTemplatesFor(def)
}

export function isProfessionalJob(job: JobDef | string): boolean {
  return PROFESSIONAL_JOB_IDS.has(typeof job === 'string' ? job : job.id)
}
