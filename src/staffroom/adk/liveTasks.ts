/* eslint-disable @typescript-eslint/no-explicit-any */
// Turns real ADK tool calls into cursor Tasks, in the order the agents made them.
import type { StaffroomState } from "../DocumentStore";
import { buildMission } from "../missions";
import type { AgentId, CheckResult, Task } from "../types";
import { checkLessonDuration } from "../validation";

const F = { header: "lesson-header", obj: "lesson-objectives", act: "lesson-activities", asmt: "lesson-assessment", learn: "learner-table", notes: "lesson-notes" } as const;
const SECTION: Record<string, string> = { objectives: F.obj, activities: F.act, assessment: F.asmt, notes: F.notes };
const AGENT_IDS = ["planner", "writer", "reviewer", "corrector", "verifier"];
const bullets = (xs: unknown) => (Array.isArray(xs) ? xs.map((x) => `• ${String(x).replace(/^[•\-*]\s*/, "")}`).join("\n") : "");

export class LiveTranslator {
  private base: Task[];
  private prev: string | null = null;
  private n = 0;
  constructor(private input: StaffroomState["input"] & object) { this.base = buildMission(input).tasks; }

  private chain(tasks: Task[]): Task[] {
    for (const t of tasks) { t.deps = this.prev ? [this.prev] : []; t.status = "pending"; this.prev = t.id; }
    return tasks;
  }
  private T(agentId: AgentId, action: Task["action"], targetId: string, label: string, payload: any, duration = 500): Task {
    return { id: `live-${++this.n}`, agentId, action, targetId, label, deps: [], duration, status: "pending", payload };
  }
  get title() { return "Lesson Plan"; }

  translate(agent: string, tool: string, args: any): Task[] {
    if (!AGENT_IDS.includes(agent)) return [];
    const a = agent as AgentId;
    const i = this.input;
    switch (tool) {
      case "set_outline": {
        const pick = (pred: (t: Task) => boolean) => this.base.filter(pred);
        const creates = pick((t) => t.action === "create_section");
        if (creates[0]) creates[0].payload = { ...creates[0].payload, bubble: `Outline: ${(args.phases ?? []).length} phases` };
        return this.chain([...creates, ...pick((t) => t.action === "populate_table" && (t.targetId === F.header || t.targetId === F.learn))]);
      }
      case "read_document": {
        const target = a === "writer" ? F.header : a === "verifier" ? F.header : F.act;
        return this.chain([this.T(a, "highlight_field", target, "Reading colleagues' work", { bubble: "Reading the shared draft" }, 400)]);
      }
      case "write_objectives": {
        const text = `By the end of this ${i.duration}-minute lesson, Grade ${i.grade} learners will:\n${bullets(args.items)}`;
        return this.chain([a === "corrector" ? this.fixText(F.obj, text) : this.T(a, "type_text", F.obj, "Writing objectives", { text, what: "objectives" })]);
      }
      case "write_assessment": {
        const text = (args.questions ?? []).map((q: string, k: number) => `${k + 1}. ${String(q).replace(/^\d+[.)]\s*/, "")}`).join("\n");
        return this.chain([a === "corrector" ? this.fixText(F.asmt, text) : this.T(a, "type_text", F.asmt, "Writing assessment", { text, what: "assessment questions" })]);
      }
      case "write_notes": {
        const text = `${bullets(args.items)}\n• Each one teach one: learners are paired by their results — the strongest works with the learner who needs most help.`;
        return this.chain([a === "corrector" ? this.fixText(F.notes, text) : this.T(a, "type_text", F.notes, "Writing teacher notes", { text, what: "teacher notes" })]);
      }
      case "write_activities": {
        const rows = (args.rows ?? []) as { phase: string; activity: string; minutes: number }[];
        if (a !== "corrector") {
          return this.chain([this.T(a, "populate_table", F.act, "Writing activities", {
            bubble: "Activities", rows: rows.map((r, k) => ({ id: `${F.act}::${k}`, cells: { phase: r.phase, activity: r.activity, minutes: String(Math.round(r.minutes)) }, status: "new" })),
          })]);
        }
        return this.chain([this.T("corrector", "correct_field", F.act, "Rewriting activities", {
          bubble: "Fixing activities", clearIssues: true, note: `Activities rewritten (${rows.reduce((s, r) => s + Math.round(r.minutes), 0)} min)`,
          steps: rows.map((r, k) => ({ targetId: `${F.act}::${k}`, patch: { phase: r.phase, activity: r.activity, minutes: String(Math.round(r.minutes)) }, note: `${Math.round(r.minutes)} min` })),
        })]);
      }
      case "check_timings": {
        const check = (s: StaffroomState): CheckResult => {
          const r = checkLessonDuration(s.fields[F.act]?.rows.map((x) => Number(x.cells.minutes) || 0) ?? [], i.duration);
          return r.ok ? { ok: true, summary: `Timings total ${r.total} of ${i.duration} min` } : { ok: false, issue: `Activities total ${r.total} min but the lesson is ${i.duration} min` };
        };
        return this.chain([this.T(a, "validate_field", F.act, "Checking timings vs duration", { what: "lesson timing", check, keepStatus: a === "verifier", bubble: "Checking timings" }, 800)]);
      }
      case "flag_issue": {
        const fid = SECTION[args.section] ?? F.act;
        return this.chain([this.T(a, "flag_issue", fid, `Flagged ${args.section ?? "section"}`, { issue: String(args.issue ?? "Issue"), bubble: "Found a problem" }, 500)]);
      }
      case "report_audit": {
        const check = (): CheckResult => (args.consistent ? { ok: true, summary: String(args.summary) } : { ok: false, issue: String(args.summary) });
        return this.chain([this.T(a, "validate_field", F.header, "Final audit", { check, keepStatus: true, bubble: "Auditing" }, 800)]);
      }
      default:
        return [];
    }
  }
  private fixText(fid: string, text: string): Task {
    return this.T("corrector", "correct_field", fid, "Rewriting section", { bubble: "Fixing", clearIssues: true, steps: [{ text }], note: "Section rewritten" });
  }
  finish(): Task[] {
    const gen = this.base.find((t) => t.action === "generate_document");
    return gen ? this.chain([{ ...gen, afterAll: false }]) : [];
  }
}
