/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StaffroomState } from "./DocumentStore";
import type { AgentId, Cells, CheckResult, Column, Field, MissionInput, Payload, Row, Task } from "./types";
import { pairLearners, checkLessonDuration, computeTotal, draftLevel, levelFromPercent, parseMarks, rebalanceMinutes } from "./validation";

export const EXAMPLES: Record<MissionInput["type"], MissionInput> = {
  lesson: {
    type: "lesson", teacher: "Ms Dlamini", school: "Sunrise Primary School", grade: "3", subject: "Mathematics",
    topic: "Addition and subtraction", duration: 40,
    learners: "Amahle | 88\nBokang | 45\nChloe | 72\nDumisani | 38\nEsona | 64\nFikile | 91",
    instructions: "Prepare a mathematics lesson plan with practical activities, learning objectives, assessment questions and teacher notes.",
  },
  report: {
    type: "report", teacher: "Ms Dlamini", school: "Sunrise Primary School", grade: "3", subject: "Mathematics",
    topic: "Term 2 progress", duration: 40,
    learners: "Amahle Zulu | 92\nBokang Mokoena | 67\nChloe Peters | 48\nDumisani Ndlovu | 74\nEsona Mbeki | 35",
    instructions: "Write a short encouraging comment per learner.",
  },
  register: {
    type: "register", teacher: "Ms Dlamini", school: "Sunrise Primary School", grade: "3", subject: "Mathematics",
    topic: "Term 2 class test", duration: 40,
    learners: "Max | 5,5,10,5\nThabo Mokoena | 4,5,8,3 | 20\nLerato Nkosi | 5,4,9,5 | 23\nSipho Ndlovu | 3,3,7,4 | 19\nNaledi Khumalo | 5,5,,4 |\nKagiso Molefe | 2,4,6,3 | 15",
    instructions: "Check totals before the register is submitted.",
  },
};

let n = 0;
const T = (agentId: AgentId, action: Task["action"], targetId: string, label: string, o: Partial<Task> = {}): Task => ({
  id: o.id ?? `task-${++n}`, agentId, action, targetId, label, deps: [], duration: 400, status: "pending", payload: {}, ...o,
});
const field = (id: string, label: string, kind: Field["kind"], columns: Column[] = [], placeholder?: string): Field => ({
  id, label, kind, columns, status: "empty", text: "", rows: [], issues: [], activeAgent: null, placeholder,
});
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

function headerTask(fid: string, i: MissionInput, extra: [string, string][], deps: string[]) {
  const kv: [string, string][] = [["Teacher", i.teacher], ["School", i.school], ["Grade", i.grade], ["Subject", i.subject], ["Topic", i.topic], ...extra];
  return T("writer", "populate_table", fid, "Filling document details", {
    deps, payload: { bubble: "Details", rows: kv.map(([k, v], r) => ({ id: `${fid}::${r}`, cells: { k, v }, status: "new" })) },
  });
}
const headerCheck = (fid: string) => (s: StaffroomState): CheckResult => {
  const empty = s.fields[fid]!.rows.filter((r) => !r.cells.v?.trim()).map((r) => r.cells.k);
  return empty.length ? { ok: false, issue: `Missing: ${empty.join(", ")}` } : { ok: true, summary: "Details complete" };
};

// ---------------- Lesson plan ----------------
const DRAFT_ACTIVITIES = [
  ["Warm-up", "Mental maths: quick-fire number bonds to 20 on mini whiteboards", 10],
  ["Concrete practice", "Model {topic} with counters and a number line; learners work in pairs", 20],
  ["Group task", "Shopping-corner word problems: buy two items, find the change", 15],
  ["Exit ticket", "Three independent questions and a thumbs-up reflection", 10],
] as const;

function lessonMission(i: MissionInput) {
  const topic = i.topic || "the topic";
  const maths = /math/i.test(i.subject);
  const p = {
    header: field("lesson-header", "Lesson details", "kv", [{ key: "k", label: "Item" }, { key: "v", label: "Detail" }]),
    obj: field("lesson-objectives", "Learning objectives", "text"),
    act: field("lesson-activities", "Lesson activities", "table", [{ key: "phase", label: "Phase" }, { key: "activity", label: "Activity" }, { key: "minutes", label: "Min", align: "right" }]),
    asmt: field("lesson-assessment", "Assessment questions", "text"),
    learn: field("learner-table", "Each one teach one — peer pairs", "table", [{ key: "name", label: "Learner" }, { key: "score", label: "Result", align: "right" }, { key: "group", label: "Pair" }, { key: "role", label: "Role" }]),
    notes: field("lesson-notes", "Teacher notes", "text"),
  };
  const order = Object.values(p);
  const creates = order.map((f, k) => T("planner", "create_section", f.id, `Creating “${f.label}”`, { id: `p-${f.id}`, duration: 150, payload: { field: f, bubble: "New section" } }));
  creates.forEach((c, k) => k && c.deps.push(creates[k - 1]!.id));

  const objText = `By the end of this ${i.duration}-minute lesson, Grade ${i.grade} learners will:\n• Explain ${topic.toLowerCase()} using concrete objects and a number line.\n• ${maths ? "Solve two-digit addition and subtraction problems without regrouping." : `Apply key ideas of ${topic.toLowerCase()} in a short task.`}\n• Describe their strategy to a partner using correct vocabulary.`;
  const asmText = maths
    ? "1. 34 + 25 = ___\n2. 68 − 23 = ___\n3. Sam has 47 stickers and gives away 15. How many are left?\n4. Write a number sentence for 52 and 36 together."
    : `1. What is ${topic}?\n2. Give one real-life example.\n3. Explain your answer to a partner.`;
  const parsed = lines(i.learners).filter((l) => !/^max\s*\|/i.test(l)).map((l) => { const [nm = "", sc = ""] = l.split("|").map((x) => x.trim()); return { name: nm, score: sc === "" ? NaN : Number(sc) }; });
  const scored = pairLearners(parsed.filter((x) => Number.isFinite(x.score)));
  const unscored = parsed.filter((x) => !Number.isFinite(x.score));
  const notesText = `• Timing: the plan must fit exactly ${i.duration} minutes.\n• Resources: counters, number lines, mini whiteboards, shopping-corner cards.\n• Each one teach one: learners are paired by their results — the strongest works with the learner who needs most help, and the peer tutor explains their strategy step by step.${i.instructions ? `\n• Teacher request: ${i.instructions}` : ""}`;

  const w1 = headerTask(p.header.id, i, [["Duration", `${i.duration} minutes`]], [creates[0]!.id]);
  const w2 = T("writer", "type_text", p.obj.id, "Writing objectives", { deps: [creates[1]!.id, w1.id], payload: { text: objText, what: "objectives" } });
  const w3 = T("writer", "populate_table", p.act.id, "Drafting activities", {
    deps: [creates[2]!.id, w2.id],
    payload: { bubble: "Activities", rows: DRAFT_ACTIVITIES.map(([phase, a, m], k) => ({ id: `${p.act.id}::${k}`, cells: { phase, activity: a.replace("{topic}", topic.toLowerCase()), minutes: String(m) }, status: "new" })) },
  });
  const w4 = T("writer", "type_text", p.asmt.id, "Writing assessment", { deps: [creates[3]!.id, w3.id], payload: { text: asmText, what: "assessment questions" } });
  const w5 = T("writer", "type_text", p.notes.id, "Writing teacher notes", { deps: [creates[5]!.id, w4.id], payload: { text: notesText, what: "teacher notes" } });
  const p7 = T("planner", "populate_table", p.learn.id, "Pairing learners by results", {
    deps: [creates[5]!.id],
    payload: { bubble: "Each one teach one", rows: [
      ...scored.map((x, k) => ({ id: `${p.learn.id}::${k}`, cells: { name: x.name, score: `${x.score}%`, group: `Pair ${x.pair}`, role: x.role }, status: "new" })),
      ...unscored.map((x, k) => ({ id: `${p.learn.id}::${scored.length + k}`, cells: { name: x.name, score: "—", group: "Not paired", role: "Result needed" }, status: "new" })),
    ] },
  });

  const durationCheck = (s: StaffroomState): CheckResult => {
    const rows = s.fields[p.act.id]!.rows;
    const mins = rows.map((r) => Number(r.cells.minutes) || 0);
    const r = checkLessonDuration(mins, i.duration);
    if (r.ok) return { ok: true, summary: `Timings total ${r.total} of ${i.duration} min` };
    return {
      ok: false,
      issue: `Activities total ${r.total} min but the lesson is ${i.duration} min (${r.over > 0 ? `${r.over} over` : `${-r.over} short`})`,
      fix: { rows: rows.map((row, k) => ({ id: row.id, from: mins[k], to: rebalanceMinutes(mins, i.duration)[k] })), from: r.total },
    };
  };
  const reviewDuration = (id: string, deps: string[], attempt: number): Task =>
    T("reviewer", "validate_field", p.act.id, attempt ? "Re-checking timings" : "Checking timings vs duration", {
      id, deps, duration: 900,
      payload: {
        what: "lesson timing", check: durationCheck,
        onFail: (r: CheckResult) => {
          if (attempt >= 2) return [];
          const cid = `c-act-${attempt}`;
          const fix = r.fix as { rows: { id: string; from: number; to: number }[]; from: number };
          return [
            T("corrector", "correct_field", p.act.id, "Rebalancing activity timings", {
              id: cid, deps: [id],
              payload: {
                bubble: "Fixing timings", issue: r.issue,
                steps: fix.rows.filter((x) => x.from !== x.to).map((x) => ({ targetId: x.id, patch: { minutes: String(x.to) }, note: `${x.from} → ${x.to} min` })),
                note: `Timings scaled from ${fix.from} to ${i.duration} min`,
              },
            }),
            reviewDuration(`r-act-${attempt + 1}`, [cid], attempt + 1),
          ];
        },
      },
    });

  const textCheck = (fid: string, min: number, what: string) => (s: StaffroomState): CheckResult => {
    const c = lines(s.fields[fid]!.text).length;
    return c >= min ? { ok: true, summary: `${what}: ${c} items` } : { ok: false, issue: `${what} needs at least ${min} items (has ${c})` };
  };
  const reviews = [
    T("reviewer", "validate_field", p.header.id, "Checking details", { deps: [w1.id], duration: 500, payload: { check: headerCheck(p.header.id) } }),
    T("reviewer", "validate_field", p.obj.id, "Checking objectives", { deps: [w2.id], duration: 600, payload: { check: textCheck(p.obj.id, 3, "Objectives") } }),
    reviewDuration("r-act-0", [w3.id], 0),
    T("reviewer", "validate_field", p.asmt.id, "Checking assessment", { deps: [w4.id], duration: 600, payload: { check: textCheck(p.asmt.id, 3, "Questions") } }),
    T("reviewer", "validate_field", p.learn.id, "Checking learner list", {
      deps: [p7.id], duration: 500,
      payload: { check: (s: StaffroomState): CheckResult => s.fields[p.learn.id]!.rows.length ? { ok: true, summary: `${s.fields[p.learn.id]!.rows.length} learners grouped` } : { ok: false, issue: "No learners listed" } },
    }),
    T("reviewer", "validate_field", p.notes.id, "Checking notes", { deps: [w5.id], duration: 500, payload: { check: textCheck(p.notes.id, 2, "Notes") } }),
  ];
  const gen = T("planner", "generate_document", p.header.id, "Compiling lesson plan", { afterAll: true, duration: 600, payload: { status: "provisional", bubble: "Compiling" } });
  return { title: "Lesson Plan", tasks: [...creates, w1, w2, w3, p7, w4, w5, ...reviews, gen] };
}

// ---------------- Progress report ----------------
const COMMENTS: Record<number, string> = {
  1: "Needs substantial support; daily practice is recommended.",
  2: "Making early progress; keep practising basic facts.",
  3: "Developing steadily; more practice with word problems will help.",
  4: "Shows sound understanding of most concepts.",
  5: "Works confidently and explains strategies clearly.",
  6: "Strong, accurate work with growing independence.",
  7: "Outstanding achievement; ready for extension tasks.",
};
const commentFor = (lvl: number) => COMMENTS[lvl] ?? "Excellent work this term.";

function reportMission(i: MissionInput) {
  const header = field("report-header", "Report details", "kv", [{ key: "k", label: "Item" }, { key: "v", label: "Detail" }]);
  const table = field("learner-table", "Learner progress", "table", [{ key: "name", label: "Learner" }, { key: "pct", label: "%", align: "right" }, { key: "level", label: "Level", align: "center" }, { key: "comment", label: "Comment" }]);
  const summary = field("report-summary", "Class summary", "text");
  const creates = [header, table, summary].map((f) => T("planner", "create_section", f.id, `Creating “${f.label}”`, { duration: 150, payload: { field: f } }));
  creates.forEach((c, k) => k && c.deps.push(creates[k - 1]!.id));
  const w1 = headerTask(header.id, i, [["Scale", "CAPS levels 1–7"]], [creates[0]!.id]);
  const people = lines(i.learners).map((l) => { const [name, pct] = l.split("|").map((x) => x.trim()); return { name, pct: Number(pct) }; });
  const tasks: Task[] = [];
  let prev = creates[1]!.id;
  people.forEach((pp, k) => {
    const rid = `${table.id}::${k}`;
    const lvl = Number.isFinite(pp.pct) ? draftLevel(pp.pct) : NaN;
    const w = T("writer", "populate_table", rid, `Writing ${pp.name}`, {
      deps: [prev], duration: 450,
      payload: { what: `Added ${pp.name}`, row: { id: rid, status: "new", cells: { name: pp.name, pct: Number.isFinite(pp.pct) ? String(pp.pct) : "", level: Number.isFinite(lvl) ? String(lvl) : "", comment: Number.isFinite(lvl) ? commentFor(lvl) : "" } } },
    });
    prev = w.id;
    const check = (s: StaffroomState): CheckResult => {
      const row = s.fields[table.id]!.rows.find((r) => r.id === rid)!;
      if (row.cells.pct === "") return { ok: false, issue: `${pp.name}: no percentage supplied — not invented` };
      const want = levelFromPercent(Number(row.cells.pct));
      const got = Number(row.cells.level);
      return got === want ? { ok: true, summary: `${pp.name}: level ${got} ✓` } : { ok: false, issue: `${pp.name}: ${row.cells.pct}% should be level ${want}, recorded ${got}`, fix: { level: String(want), comment: commentFor(want), was: got } };
    };
    const review = (id: string, deps: string[], attempt: number): Task => T("reviewer", "validate_field", rid, attempt ? `Re-checking ${pp.name}` : `Checking ${pp.name}`, {
      id, deps, duration: 550,
      payload: {
        check, keepStatus: attempt > 0,
        failStatus: (r: CheckResult) => (r.fix ? "warning" : "missing"),
        onFail: (r: CheckResult) => {
          if (!r.fix || attempt >= 2) return [];
          const cid = `${id}-fix`;
          return [
            T("corrector", "correct_field", rid, `Correcting ${pp.name}`, { id: cid, deps: [id], payload: { issue: r.issue, steps: [], patch: { level: r.fix.level, comment: r.fix.comment }, rowStatus: "corrected", note: `Level ${r.fix.was} → ${r.fix.level}` } }),
            review(`${id}-re`, [cid], attempt + 1),
          ];
        },
      },
    });
    tasks.push(w, review(`r-${rid}`, [w.id], 0));
  });
  const sum = T("writer", "type_text", summary.id, "Writing class summary", {
    afterAll: true,
    payload: {
      what: "class summary",
      textFn: (s: StaffroomState) => {
        const rows = s.fields[table.id]!.rows.filter((r) => r.cells.pct !== "");
        const avg = rows.length ? Math.round(rows.reduce((a, r) => a + Number(r.cells.pct), 0) / rows.length) : 0;
        const fixed = s.fields[table.id]!.rows.filter((r) => r.status === "corrected").length;
        return `${rows.length} learners assessed. Class average: ${avg}% (level ${levelFromPercent(avg)}).\n${fixed} level${fixed === 1 ? "" : "s"} corrected after review against the CAPS scale.${i.instructions ? `\nNote: ${i.instructions}` : ""}`;
      },
    },
  });
  const gen = T("planner", "generate_document", header.id, "Compiling report", { afterAll: true, deps: [sum.id], duration: 600, payload: { status: "provisional" } });
  return { title: "Learner Progress Report", tasks: [...creates, w1, T("reviewer", "validate_field", header.id, "Checking details", { deps: [w1.id], duration: 500, payload: { check: headerCheck(header.id) } }), ...tasks, sum, gen] };
}

// ---------------- Assessment register ----------------
function registerMission(i: MissionInput) {
  const ls = lines(i.learners);
  const maxLine = ls.find((l) => /^max\s*\|/i.test(l));
  const rowsIn = ls.filter((l) => l !== maxLine).map((l) => {
    const [name, marks = "", recorded = ""] = l.split("|").map((x) => x.trim());
    return { name, marks: parseMarks(marks), recorded };
  });
  const qCount = Math.max(1, ...rowsIn.map((r) => r.marks.length));
  const maxes = maxLine ? parseMarks(maxLine.split("|")[1] ?? "") : [];
  const maxTotal = maxes.length === qCount && maxes.every((m) => m !== null) ? computeTotal(maxes) : null;
  const header = field("register-header", "Register details", "kv", [{ key: "k", label: "Item" }, { key: "v", label: "Detail" }]);
  const qCols: Column[] = Array.from({ length: qCount }, (_, q) => ({ key: `q${q + 1}`, label: `Q${q + 1}${maxes[q] != null ? ` /${maxes[q]}` : ""}`, align: "center" }));
  const sheet = field("marksheet", "Marksheet", "table", [{ key: "name", label: "Learner" }, ...qCols, { key: "recorded", label: "Recorded", align: "right" }, { key: "calculated", label: "Calculated", align: "right" }]);
  const summary = field("register-summary", "Moderation summary", "text");
  const creates = [header, sheet, summary].map((f) => T("planner", "create_section", f.id, `Creating “${f.label}”`, { duration: 150, payload: { field: f } }));
  creates.forEach((c, k) => k && c.deps.push(creates[k - 1]!.id));
  const w1 = headerTask(header.id, i, [["Total marks", maxTotal != null ? String(maxTotal) : "Not given"]], [creates[0]!.id]);
  const tasks: Task[] = [];
  let prev = creates[1]!.id;
  rowsIn.forEach((rin, k) => {
    const rid = `${sheet.id}::${k}`;
    const cells: Cells = { name: rin.name ?? "", recorded: rin.recorded, calculated: "" };
    qCols.forEach((c, q) => (cells[c.key] = rin.marks[q] == null ? "" : String(rin.marks[q])));
    const add = T("writer", "populate_table", rid, `Entering marks: ${rin.name}`, { deps: [prev], duration: 500, payload: { what: `Entered ${rin.name}`, row: { id: rid, status: "new", cells } as Row } });
    const marksOf = (s: StaffroomState) => { const row = s.fields[sheet.id]!.rows.find((r) => r.id === rid)!; return { row, marks: qCols.map((c) => (row.cells[c.key] === "" ? null : Number(row.cells[c.key]))) }; };
    const calc = T("writer", "populate_table", rid, `Totalling ${rin.name}`, {
      deps: [add.id], duration: 350,
      payload: { what: `Totalled ${rin.name}`, patchFn: (s: StaffroomState) => { const t = computeTotal(marksOf(s).marks); return { calculated: t == null ? "—" : String(t) }; } },
    });
    prev = calc.id;
    const check = (s: StaffroomState): CheckResult => {
      const { row, marks } = marksOf(s);
      const missing = marks.map((m, q) => (m == null ? `Q${q + 1}` : null)).filter(Boolean);
      if (missing.length) return { ok: false, issue: `${rin.name}: ${missing.join(", ")} missing — mark not invented, teacher to supply` };
      const over = marks.map((m, q) => (maxes[q] != null && (m as number) > (maxes[q] as number) ? `Q${q + 1}` : null)).filter(Boolean);
      if (over.length) return { ok: false, issue: `${rin.name}: ${over.join(", ")} exceeds the maximum` };
      const total = computeTotal(marks)!;
      if (row.cells.proposed) return Number(row.cells.proposed) === total ? { ok: true, summary: `${rin.name}: proposal ${total} verified — needs teacher approval` } : { ok: false, issue: `${rin.name}: proposal ${row.cells.proposed} ≠ ${total}`, fix: { total } };
      if (row.cells.recorded === "") return { ok: false, issue: `${rin.name}: recorded total missing (marks add to ${total})`, fix: { total } };
      return Number(row.cells.recorded) === total ? { ok: true, summary: `${rin.name}: ${total} ✓` } : { ok: false, issue: `${rin.name}: recorded ${row.cells.recorded} but marks add to ${total}`, fix: { total } };
    };
    const review = (id: string, deps: string[], attempt: number): Task => T("reviewer", "validate_field", rid, attempt ? `Re-checking ${rin.name}` : `Checking ${rin.name}`, {
      id, deps, duration: 600,
      payload: {
        check, keepStatus: attempt > 0, failStatus: (r: CheckResult) => (r.fix ? "warning" : "missing"),
        onFail: (r: CheckResult) => {
          if (!r.fix || attempt >= 2) return [];
          const cid = `${id}-fix`;
          return [
            T("corrector", "correct_field", rid, `Proposing total: ${rin.name}`, { id: cid, deps: [id], payload: { issue: r.issue, steps: [], patch: { proposed: String(r.fix.total) }, rowStatus: "proposed", note: `Proposed ${r.fix.total} — awaiting teacher approval` } }),
            review(`${id}-re`, [cid], attempt + 1),
          ];
        },
      },
    });
    tasks.push(add, calc, review(`r-${rid}`, [calc.id], 0));
  });
  const sum = T("planner", "type_text", summary.id, "Writing moderation summary", {
    afterAll: true,
    payload: {
      what: "moderation summary",
      textFn: (s: StaffroomState) => {
        const rows = s.fields[sheet.id]!.rows;
        const totals = rows.map((r) => Number(r.cells.calculated)).filter((x) => Number.isFinite(x));
        const avg = totals.length ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1) : "—";
        return `${rows.length} learners captured. ${rows.filter((r) => r.status === "ok").length} totals verified.\n${rows.filter((r) => r.status === "proposed").length} corrected total(s) proposed — teacher approval required.\n${rows.filter((r) => r.status === "missing").length} learner(s) with missing marks — left blank, not estimated.\nAverage of complete totals: ${avg}${maxTotal != null ? ` / ${maxTotal}` : ""}.`;
      },
    },
  });
  const gen = T("planner", "generate_document", header.id, "Compiling provisional register", { afterAll: true, deps: [sum.id], duration: 600, payload: { status: "provisional" } });
  return { title: "Assessment Register", tasks: [...creates, w1, T("reviewer", "validate_field", header.id, "Checking details", { deps: [w1.id], duration: 500, payload: { check: headerCheck(header.id) } }), ...tasks, sum, gen] };
}

export function buildMission(i: MissionInput): { title: string; tasks: Task[] } {
  n = 0;
  return i.type === "lesson" ? lessonMission(i) : i.type === "report" ? reportMission(i) : registerMission(i);
}

export function registerCsv(s: StaffroomState): string {
  const f = s.fields["marksheet"];
  if (!f) return "";
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = [...f.columns.map((c) => c.label), "Proposed", "Status", "Note"];
  const body = f.rows.map((r) => [...f.columns.map((c) => r.cells[c.key] ?? ""), r.cells.proposed ?? "", r.status, r.note ?? ""]);
  return [head, ...body].map((row) => row.map((v) => esc(String(v))).join(",")).join("\n");
}

export type { Payload };
