// Paper-to-digital intake: shared, deterministic rules (browser + server).
// The vision model only *reads*; everything here decides what the teacher must confirm
// and what the agents may build. Unreadable marks are never guessed.
import { computeTotal } from "../validation";

/** Normalised 0-1000 box on the source photo: [x, y, width, height]. */
export type Box = [number, number, number, number];
export interface ReadCell {
  /** Value as read, or null when the cell is blank or unreadable. */
  value: number | null;
  /** blank = nothing written (a missing mark); unclear = something written that cannot be read with certainty. */
  state: "clear" | "unclear" | "blank";
  confidence: number;
  /** Other plausible readings for an unclear cell. */
  alternatives: number[];
  box?: Box | null;
}
export interface ReadRow { name: string; nameBox?: Box | null; marks: ReadCell[]; recorded: ReadCell }
export interface Extraction {
  title: string; grade: string; subject: string; topic: string;
  maxes: (number | null)[];
  rows: ReadRow[];
}
export interface Question {
  id: string; row: number; col: number | "total" | "max";
  prompt: string; options: number[]; box?: Box | null;
}
/** Teacher answer: a number, or null = "leave blank / mark is missing". */
export type Answers = Record<string, number | null>;

export type Stage =
  | "WAITING_FOR_TEACHER" | "READY_FOR_REGISTER" | "REGISTER_RUNNING" | "REGISTER_VERIFIED"
  | "PLAN_RUNNING" | "PLAN_READY" | "APPROVED" | "FAILED";

export const CONFIDENCE_FLOOR = 0.8;
const uncertain = (c: ReadCell) => c.state === "unclear" || (c.state === "clear" && (c.value == null || c.confidence < CONFIDENCE_FLOOR));

export function buildQuestions(x: Extraction): Question[] {
  const qs: Question[] = [];
  x.maxes.forEach((m, q) => { if (m == null) qs.push({ id: `max-${q}`, row: -1, col: "max", prompt: `What is the maximum mark for Q${q + 1}?`, options: [] }); });
  x.rows.forEach((r, i) => {
    r.marks.forEach((c, q) => {
      if (uncertain(c)) qs.push({ id: `m-${i}-${q}`, row: i, col: q, box: c.box ?? null, prompt: `${r.name || `Learner ${i + 1}`}, Q${q + 1}: the handwriting is unclear. Which mark did you record?`, options: uniq([c.value, ...c.alternatives]) });
    });
    if (uncertain(r.recorded)) qs.push({ id: `t-${i}`, row: i, col: "total", box: r.recorded.box ?? null, prompt: `${r.name || `Learner ${i + 1}`}: the written total is unclear. What total did you write?`, options: uniq([r.recorded.value, ...r.recorded.alternatives]) });
  });
  return qs;
}
const uniq = (v: (number | null)[]) => [...new Set(v.filter((n): n is number => n != null && Number.isFinite(n)))];

export const unanswered = (qs: Question[], a: Answers) => qs.filter((q) => !(q.id in a));

export interface ConfirmedRow { name: string; marks: (number | null)[]; recorded: number | null; teacherConfirmed: number[] }
export interface Confirmed { maxes: (number | null)[]; rows: ConfirmedRow[] }

/** Apply teacher answers. Throws if any question is still open: nothing is guessed. */
export function confirm(x: Extraction, qs: Question[], a: Answers): Confirmed {
  const open = unanswered(qs, a);
  if (open.length) throw new Error(`${open.length} entr${open.length === 1 ? "y needs" : "ies need"} teacher confirmation`);
  const maxes = x.maxes.map((m, q) => (`max-${q}` in a ? a[`max-${q}`]! : m));
  const rows = x.rows.map((r, i) => {
    const teacherConfirmed: number[] = [];
    const marks = r.marks.map((c, q) => { const k = `m-${i}-${q}`; if (k in a) { teacherConfirmed.push(q); return a[k]!; } return c.state === "blank" ? null : c.value; });
    const recorded = `t-${i}` in a ? a[`t-${i}`]! : r.recorded.state === "blank" ? null : r.recorded.value;
    return { name: r.name, marks, recorded, teacherConfirmed };
  });
  return { maxes, rows };
}

/** The register mission's learner text ("Max | 5,5,10" then "Name | marks | recorded"). */
export function toRegisterLearners(c: Confirmed): string {
  return [`Max | ${c.maxes.map((m) => m ?? "").join(",")}`, ...c.rows.map((r) => `${r.name} | ${r.marks.map((m) => m ?? "").join(",")} | ${r.recorded ?? ""}`)].join("\n");
}

export interface ClassAnalysis {
  maxTotal: number | null;
  learners: { name: string; total: number | null; pct: number | null; complete: boolean }[];
  questions: { q: number; avgPct: number }[];
  weakest: { q: number; avgPct: number }[];
  classAvgPct: number | null;
  below50: number;
  incomplete: number;
}

/** Analyse the verified register: calculated totals only (recorded totals are never trusted for the plan). */
export function analyse(c: Confirmed): ClassAnalysis {
  const maxTotal = c.maxes.length && c.maxes.every((m) => m != null) ? computeTotal(c.maxes) : null;
  const learners = c.rows.map((r) => {
    const total = computeTotal(r.marks);
    const pct = total != null && maxTotal ? Math.round((total / maxTotal) * 100) : null;
    return { name: r.name, total, pct, complete: total != null };
  });
  const questions = c.maxes.map((m, q) => {
    const vals = c.rows.map((r) => r.marks[q]).filter((v): v is number => v != null);
    return { q: q + 1, avgPct: m && vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length / m) * 100) : 0 };
  });
  const weakest = [...questions].sort((a, b) => a.avgPct - b.avgPct).slice(0, Math.min(2, questions.length));
  const pcts = learners.map((l) => l.pct).filter((p): p is number => p != null);
  return {
    maxTotal, learners, questions, weakest,
    classAvgPct: pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null,
    below50: pcts.filter((p) => p < 50).length, incomplete: learners.filter((l) => !l.complete).length,
  };
}

/** Lesson-plan mission built from the verified register, not example data. */
export const cleanGrade = (g: string) => g.replace(/^\s*(gr(ade)?\.?)\s*/i, "").trim();

export function remedialMission(x: Pick<Extraction, "grade" | "subject" | "topic">, c: Confirmed) {
  const a = analyse(c);
  const focus = a.weakest.map((w) => `Q${w.q} (class average ${w.avgPct}%)`).join(" and ");
  return {
    type: "lesson" as const, teacher: "Teacher", school: "", grade: cleanGrade(x.grade || ""), subject: x.subject || "Mathematics",
    topic: `Remediation: ${x.topic || "class test"} — ${focus}`.slice(0, 200), duration: 40,
    learners: a.learners.map((l) => `${l.name} | ${l.pct ?? ""}`).join("\n"),
    instructions: `Remedial lesson based on the verified register. Class average ${a.classAvgPct ?? "n/a"}%. ${a.below50} learner(s) below 50%. Weakest: ${focus}. ${a.incomplete} learner(s) have missing marks and are not paired until results are supplied. Use peer tutoring (each one teach one).`.slice(0, 2000),
  };
}
