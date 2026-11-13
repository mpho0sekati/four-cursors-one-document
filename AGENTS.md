<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- AI Staffroom engine lives in `src/staffroom/`: missions produce Tasks, SimulationController executes them and emits `AgentEvent`s, and the DocumentStore reducer is the only thing that changes document state — keeps the producer swappable for a real agent backend.
- Cursors locate targets via `data-field-id` (rows use `fieldId::n`) and re-measure every frame — never hardcode coordinates.
- Sound effects are synthesised in `src/staffroom/sound.ts` and subscribe via `staffroom.onEvent`; never add audio files or trigger sounds from components.
- Live agents use Google ADK (adk-js) in `src/staffroom/adk/*.server.ts`, imported from `@google/adk/dist/web/index_web.js` (the main build pulls Node-only modules that break on the Worker runtime); every agent tool call is streamed as a `decision` and turned into Tasks by `adk/liveTasks.ts` (LiveTranslator), so live runs drive the cursors in real time while checks still run in the browser.
- ADK models reach the Lovable AI Gateway through the `GatewayLlm` BaseLlm adapter (chat-completions + tool calls), so no Google API key is needed.
- Paper intake lives in `src/staffroom/intake/`: `logic.ts` (pure, tested) decides which read cells need teacher confirmation and builds the register/remedial inputs; the server (`/api/intake`, `/api/intake/$id`) owns the mission stage (incl. WAITING_FOR_TEACHER) and refuses to run agents while questions are open — so nothing unreadable is ever guessed.
- Intake missions persist in Lovable Cloud (`intake_missions`, RLS on with no policies, service-role only via `intake/store.server.ts`, 30-day cleanup); every stage change is a compare-and-set on `updated_at` and `runGate` in `intake/logic.ts` decides when agents may start — so missions survive reloads/instances and a double submit never starts a second agent run.
- The register team runs a bounded Reviewer → Corrector loop (`MAX_REVIEW_ROUNDS`) that exits only when a review round leaves no open issues.
