# Staffroom

A frontend demonstration of a swarm-style document workspace for teachers. Five simulated AI colleagues — **Planner**, **Writer**, **Reviewer**, **Corrector** and a final **Verifier** that audits the finished document against the mission — appear as animated cursors that move to real fields on an A4 page and build a lesson plan, progress report or mark register live.

> All colleagues are simulated in the browser. No real AI backend is called. Sample school, teacher and learner data is fictional.

## Features

- **Three-panel layout:** Mission Desk (inputs), Living Document (A4 canvas), Agent Control Panel (status, log, controls).
- **Five animated cursors** with spring motion, velocity tilt and tool badges (crosshair, I-beam, scanner, correction wand, verifier shield).
- **Real document state:** progressive typing, table rows inserted one by one, statuses (editing → checking → warning → corrected → approved).
- **Genuine validation:** the Reviewer runs real checks (e.g. activity minutes vs. lesson duration, mark totals, level scales) and the Corrector applies justified fixes.
- **Blueprint previews**, alignment guides and a completion regroup animation around the document seal.
- **Procedural sound** (Web Audio, no audio files) with a mute toggle.
- **Controls:** Start, Pause/Resume, Replay, Reset, speed 1×/2×/3×. The Lesson Plan demo auto-starts on load.

## Demonstration missions

| Mission | What the Reviewer catches |
| --- | --- |
| Lesson plan | Activity minutes don't add up to the lesson duration |
| Mark register | Recorded totals that differ from calculated totals (proposed for teacher approval) |
| Progress report | Achievement levels outside the 1–7 scale |

## Getting started

```sh
npm install
npm run dev     # http://localhost:8080
npm test        # vitest
npm run build
```

Stack: TanStack Start v1, React 19, Vite 7, Tailwind CSS v4, TypeScript.

## Project structure

```text
src/
  routes/index.tsx            Page shell, three panels, auto-start
  components/staffroom/
    MissionDesk.tsx           Mission inputs form
    DocumentCanvas.tsx        A4 living document (fields carry data-field-id)
    AgentActivityPanel.tsx    Agent cards, event log, controls
    CursorLayer.tsx           Overlay hosting the five cursors
    AgentCursor.tsx           Spring/tilt cursor + tool badges
    Blueprint.tsx             Wireframe preview while Planner creates a section
  staffroom/
    types.ts                  AgentEvent / Task / Field contracts
    missions.ts               Builds the task list for each mission type
    TaskScheduler.ts          Dependencies + per-field locking
    SimulationController.ts   Runs tasks, emits AgentEvents
    DocumentStore.ts          Reducer: the only place document state changes
    validation.ts(+ .test.ts) Checks used by the Reviewer
    sound.ts                  Web Audio effects subscribed to events
    agents.ts                 Agent names, roles, colours
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the engine works and how to plug in a real agent backend.

## Live AI agents (Google ADK)

Tick **Live AI agents (Google ADK)** in the Mission Desk for a lesson plan. A real five-agent ADK team (`SequentialAgent` of Planner → Writer → Reviewer → Corrector → Verifier `LlmAgent`s sharing one draft via tools) writes the lesson on the server (`/api/adk-mission`, streamed as NDJSON), and every real tool call the agents make (outline, writing, timing checks, flagged issues, fixes, final audit) is streamed live and drives the cursors as it happens. Learner names are not sent to the AI.

## From a photo (live only)

Mission Desk → **From a photo**: snap or upload a handwritten marksheet. A vision model reads it, marks it can't read with certainty become questions for the teacher (the mission waits in `WAITING_FOR_TEACHER`, and survives a reload), then the five ADK agents build the register with a bounded review loop, write a remedial lesson plan from the confirmed scores, and the teacher approves and downloads the CSV and plan.
