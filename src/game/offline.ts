// Offline resolution of queued game tasks (the 'aiTask' modal: this year's events, a choice's
// outcome, "Do Anything", job interviews, application screening, the obituary). Everything is
// built in: the event library, scripted interviews and the CV screener. The store resolves a task
// the moment it reaches the head of the modal queue.
//
// CONTRACT NOTE (lead): for now this re-exports the implementation that still lives in
// src/ai/director.ts. The "remove AI" builder moves applyFallback (and only what it needs) here,
// deletes src/ai/, and keeps both export names so engine code and tests can import from here.
export { applyFallback, applyFallback as resolveTask } from '../ai/director'
