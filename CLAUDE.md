# Cyber Office

A pixel-art browser game where you live a real day as a junior security analyst: walk the office, read real-looking email, dig through logs, deal with coworkers, and watch your choices play out. Not a quiz and not a wall of text. Built in public as a portfolio piece for internship applications.

Read @PROJECT.md first: it has the goal, the current notes (done, in progress, next, issues), recent runs and what is waiting on Soliman. The Command Center keeps it up to date after every run.

## Guardrails (Soliman, Nov 1 2026): read before building anything

Earlier runs built the wrong thing (generic dark-card UI, mechanics without the real look) and called it done
because tests passed. Tests passing is NOT done. These rules apply to every run:

1. **His words are the spec.** Before coding, copy his request word for word into the PR description as a checklist.
   At the end, tick each line with proof (a screenshot or a check). Anything not ticked is reported as NOT DONE.
2. **Reference first.** Any screen that imitates a real tool (pfSense, Splunk, Windows, Kali, scoring engine,
   report) must have a real reference image in `docs/reference/` first. If none can be fetched, ask Soliman for
   one and build other things meanwhile. Do not guess the look.
3. **One screen, then stop.** For a new look or a redesign, build ONE screen, put a side-by-side
   screenshot (real tool | ours) in the PR, and get his OK before building the rest.
4. **Done = he would recognise it.** A screen is done only when a side-by-side screenshot shows it matches the
   real tool. Report test counts as Details, never as the result.
