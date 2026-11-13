# Architecture

## Data flow

```text
MissionInput ─► missions.buildMission() ─► Task[]
                                             │
                     TaskScheduler (deps, locks, afterAll)
                                             │
                SimulationController.exec() ─► AgentEvent
                                             │
              staffroom.dispatch() ─► applyEvent() reducer ─► React (useStaffroom)
                                             └─► onEvent listeners (sound)
```

## Key contracts (`src/staffroom/types.ts`)

- **Task** — one unit of work for one agent: `action`, `targetId`, `deps`, `duration`, `payload`. `afterAll` tasks wait until every other task is done.
- **AgentEvent** — `{ agentId, action, targetId, status, payload, summary }`. Status is `running`, `progress`, `completed` or `failed`. Progress events are not logged.
- **Field** — a document section (`text`, `table` or `kv`) with rows, status, issues and the active agent.

Actions: `navigate_to_field`, `focus_field`, `create_section`, `type_text`, `populate_table`, `highlight_field`, `validate_field`, `flag_issue`, `correct_field`, `approve_field`, `generate_document`.

## Rules

1. **The reducer is the only writer.** Components never mutate document state; they read via `useStaffroom(selector)`.
2. **Targets are DOM-addressed.** Fields render `data-field-id="<id>"`; table rows use `<fieldId>::<n>`. Cursors re-measure their target every animation frame, so layout changes never break them.
3. **Locking.** A field and its rows conflict (`targetsConflict`), so two agents never edit the same place at once. Waiting agents show "Waiting on …".
4. **Validation is real.** `validate_field` tasks call a `check(state)` function against the current document; failures emit `flag_issue` and can enqueue Corrector follow-up tasks via `onFail`.
5. **Teacher approval.** Corrections to recorded marks are left as `proposed` until the teacher approves (`agentId: "teacher"`).
6. **Sound** is a side-effect subscriber (`staffroom.onEvent`) in `sound.ts`; no audio files.

## Event producers

`SimulationController` is just an event producer. A real multi-agent backend (e.g. ADK, CrewAI) can stream the same `AgentEvent` objects — over WebSocket or SSE — and call `staffroom.dispatch(event)` for each. The canvas, cursors, log and sound need no changes.

## Adding a mission

1. Add the type to `MissionType` in `types.ts`.
2. Add a builder in `missions.ts` returning `{ title, tasks }` (Planner `create_section` tasks first, then Writer, Reviewer `validate_field`, and a final `afterAll` `generate_document`).
3. Put check logic in `validation.ts` and cover it in `validation.test.ts`.

## Live ADK mode

`/api/adk-mission` runs the Google ADK team (`src/staffroom/adk/team.server.ts`) and streams NDJSON. Each `decision` message (agent, tool, args) is mapped by `LiveTranslator` (`adk/liveTasks.ts`) into chained Tasks added to the scheduler while it runs, so cursors show the agents' actual choices in order. `SimulationController.startLive` keeps the loop open until the stream ends.
