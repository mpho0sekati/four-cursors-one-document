import { AGENTS, AGENT_IDS } from "./agents";
import { initialState, staffroom } from "./DocumentStore";
import { buildMission } from "./missions";
import { TaskScheduler } from "./TaskScheduler";
import type { ActionType, AgentEvent, AgentId, CheckResult, EventStatus, MissionInput, Payload, Task } from "./types";

class Aborted extends Error {}

/**
 * Simulated event producer. It turns mission tasks into AgentEvents and sends them to the
 * store. A real backend could replace this class and dispatch the same events.
 */
export class SimulationController {
  scheduler = new TaskScheduler();
  private token = 0;
  private paused = false;
  private speed: 1 | 2 | 3 = 1;
  private busy: Record<AgentId, boolean> = { planner: false, writer: false, reviewer: false, corrector: false };
  private evt = 0;
  lastInput: MissionInput | null = null;

  start(input: MissionInput) {
    this.token++;
    const tok = this.token;
    this.lastInput = input;
    const mission = buildMission(input);
    staffroom.reset(initialState(input, mission.title));
    this.scheduler.load(mission.tasks);
    AGENT_IDS.forEach((a) => (this.busy[a] = false));
    this.paused = false;
    this.syncControl({ running: true, complete: false, regroup: false });
    void this.loop(tok);
  }
  /** Stop everything and return to a blank page; Replay still remembers the last mission. */
  reset() {
    this.token++;
    this.scheduler.load([]);
    AGENT_IDS.forEach((a) => (this.busy[a] = false));
    this.paused = false;
    staffroom.reset(initialState());
    this.syncControl({ running: false, complete: false, regroup: false });
  }
  restart() { if (this.lastInput) this.start(this.lastInput); }
  pause() { this.paused = true; this.syncControl({}); }
  resume() { this.paused = false; this.syncControl({}); }
  setSpeed(s: 1 | 2 | 3) { this.speed = s; this.syncControl({}); }

  private syncControl(extra: Partial<ReturnType<typeof staffroom.get>["control"]>) {
    const c = this.scheduler.counts;
    staffroom.patch((s) => ({ ...s, control: { ...s.control, ...extra, paused: this.paused, speed: this.speed, done: c.done, total: c.total } }));
  }

  private async sleep(ms: number, tok: number) {
    let left = ms;
    while (left > 0) {
      await new Promise((r) => setTimeout(r, 16));
      if (tok !== this.token) throw new Aborted();
      if (!this.paused) left -= 16 * this.speed;
    }
  }

  private emit(t: Task, action: ActionType, status: EventStatus, payload: Payload = {}, summary?: string, targetId = t.targetId) {
    const e: AgentEvent = {
      id: `event-${String(++this.evt).padStart(3, "0")}`,
      agentId: t.agentId, action, targetId, status, taskId: t.id, summary, at: Date.now(),
      payload: { label: t.label, ...payload },
    };
    staffroom.dispatch(e);
  }

  private setAgent(id: AgentId, patch: Partial<ReturnType<typeof staffroom.get>["agents"][AgentId]>) {
    const cur = staffroom.get().agents[id];
    if (Object.entries(patch).every(([k, v]) => cur[k as keyof typeof cur] === v)) return;
    staffroom.patch((s) => ({ ...s, agents: { ...s.agents, [id]: { ...s.agents[id], ...patch } } }));
  }

  private async loop(tok: number) {
    try {
      while (true) {
        if (tok !== this.token) return;
        if (!this.paused) {
          for (const a of AGENT_IDS) {
            if (this.busy[a]) continue;
            const t = this.scheduler.next(a);
            if (t) { this.run(t, tok); continue; }
            const blocker = this.scheduler.blocker(a);
            if (blocker) this.setAgent(a, { status: "waiting", bubble: `Waiting on ${AGENTS[blocker].name}` });
            else this.setAgent(a, { status: "idle", bubble: "" , currentTask: "Standing by" });
          }
        }
        if (this.scheduler.finished && AGENT_IDS.every((a) => !this.busy[a])) break;
        await this.sleep(40, tok);
      }
      AGENT_IDS.forEach((a) => this.setAgent(a, { status: "done", bubble: "", target: null, currentTask: "Mission complete" }));
      this.syncControl({ running: false, complete: true, regroup: true });
    } catch (err) {
      if (!(err instanceof Aborted)) console.error(err);
    }
  }

  private run(t: Task, tok: number) {
    this.busy[t.agentId] = true;
    this.scheduler.acquire(t);
    this.syncControl({});
    this.exec(t, tok)
      .then(() => {
        if (tok !== this.token) return;
        this.scheduler.release(t);
        this.busy[t.agentId] = false;
        this.syncControl({});
      })
      .catch((err) => { if (!(err instanceof Aborted)) console.error(err); });
  }

  private async exec(t: Task, tok: number) {
    const p = t.payload;
    if (t.action === "create_section") {
      // Planner drags out a wireframe box, then the real section replaces it.
      this.emit(t, "create_section", "running", { field: p.field, bubble: "Drafting layout" });
      this.emit(t, "navigate_to_field", "running", { bubble: "Drafting layout" }, undefined, "__blueprint");
      await this.sleep(1300, tok);
      this.emit(t, "focus_field", "running", {}, undefined, "__blueprint");
      await this.sleep(200, tok);
      this.emit(t, "create_section", "completed", { field: p.field }, `Created “${p.field.label}”`);
      await this.sleep(t.duration + 180, tok);
      return;
    }
    this.emit(t, "navigate_to_field", "running", { bubble: p.bubble ?? t.label });
    await this.sleep(700, tok);
    this.emit(t, "focus_field", "running");
    await this.sleep(260, tok);

    switch (t.action) {
      case "type_text": {
        const text: string = p.textFn ? p.textFn(staffroom.get()) : p.text;
        const step = 2;
        for (let i = step; i < text.length; i += step) {
          this.emit(t, "type_text", "progress", { text: text.slice(0, i) });
          await this.sleep(text[i] === "\n" ? 140 : 28, tok);
        }
        this.emit(t, "type_text", "completed", { text }, `Wrote ${p.what ?? "text"}`);
        break;
      }
      case "populate_table": {
        if (p.rows) {
          for (const row of p.rows) {
            this.emit(t, "populate_table", "progress", { row });
            await this.sleep(320, tok);
          }
          this.emit(t, "populate_table", "completed", {}, `Filled ${p.rows.length} rows`);
        } else if (p.row) {
          this.emit(t, "populate_table", "completed", { row: p.row }, p.what ?? "Added row", t.targetId.split("::")[0]);
          await this.sleep(t.duration, tok);
        } else if (p.patchFn) {
          this.emit(t, "highlight_field", "running");
          await this.sleep(t.duration, tok);
          this.emit(t, "populate_table", "completed", { patch: p.patchFn(staffroom.get()) }, p.what ?? "Updated row");
        }
        break;
      }
      case "validate_field": {
        this.emit(t, "validate_field", "running", { bubble: "Checking…" });
        await this.sleep(t.duration, tok);
        const r: CheckResult = p.check(staffroom.get());
        this.emit(t, "validate_field", "completed", { ok: r.ok });
        if (r.ok) {
          this.emit(t, "approve_field", "completed", { keepStatus: p.keepStatus, note: r.summary }, r.summary ?? `Verified ${p.what ?? "field"}`);
        } else {
          this.emit(t, "flag_issue", "completed", { issue: r.issue, rowStatus: p.failStatus?.(r) }, `Flagged: ${r.issue}`);
          await this.sleep(400, tok);
          const follow = p.onFail?.(r, t) as Task[] | undefined;
          if (follow?.length) { this.scheduler.add(follow); this.syncControl({}); }
        }
        break;
      }
      case "correct_field": {
        const steps: Payload[] = p.steps;
        for (const s of steps) {
          this.emit(t, "correct_field", "progress", s, undefined, s.targetId ?? t.targetId);
          await this.sleep(420, tok);
        }
        this.emit(t, "correct_field", "completed", { note: p.note, issue: p.issue, rowStatus: p.rowStatus, patch: p.patch }, p.note ?? "Applied correction");
        break;
      }
      case "generate_document":
        await this.sleep(t.duration, tok);
        this.emit(t, "generate_document", "completed", { status: p.status }, "Compiled document");
        break;
      default:
        await this.sleep(t.duration, tok);
        this.emit(t, t.action, "completed", p, t.label);
    }
    await this.sleep(180, tok);
  }
}

export const simulation = new SimulationController();
