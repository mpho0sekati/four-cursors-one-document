/* eslint-disable @typescript-eslint/no-explicit-any */
// ADK agent teams for the Term Progress Report and Assessment Register.
// Arithmetic (levels, totals) is done by deterministic tools; the agents write the words
// and decide what to flag, correct and sign off.
import { FunctionTool, InMemoryRunner, LlmAgent, SequentialAgent } from "@google/adk/dist/web/index_web.js";
import { z } from "zod";
import type { MissionInput } from "../types";
import { computeTotal, levelFromPercent, parseMarks } from "../validation";
import type { AdkStreamMsg, RegisterContent, ReportContent } from "./content";
import { GatewayLlm } from "./gatewayLlm.server";

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

function kit(send: (m: AdkStreamMsg) => void) {
  const log = (agent: string, text: string) => send({ type: "log", agent, text });
  const tool = (agent: string, name: string, description: string, parameters: any, run: (a: any) => unknown) =>
    new FunctionTool({ name, description, parameters, execute: (a: any) => { const r = run(a); send({ type: "decision", agent, tool: name, args: a ?? {}, result: r }); log(agent, `${name} → ${JSON.stringify(r).slice(0, 140)}`); return r; } });
  const run = async (agents: LlmAgent[]) => {
    const team = new SequentialAgent({ name: "staffroom", subAgents: agents });
    const runner = new InMemoryRunner({ agent: team, appName: "staffroom" });
    const session = await runner.sessionService.createSession({ appName: "staffroom", userId: "teacher" });
    for await (const ev of runner.runAsync({ userId: "teacher", sessionId: session.id, newMessage: { role: "user", parts: [{ text: "Start the mission." }] } })) {
      const e = ev as any;
      if (e.errorMessage) throw new Error(e.errorMessage);
      const t = e.content?.parts?.map((p: any) => p.text).filter(Boolean).join(" ");
      if (t && e.author) log(e.author, t.slice(0, 200));
    }
  };
  return { tool, run, model: new GatewayLlm() as any };
}

export async function runReportTeam(input: MissionInput, send: (m: AdkStreamMsg) => void): Promise<ReportContent> {
  const { tool, run, model } = kit(send);
  // Learners are referred to by number so names never leave the server.
  const people = lines(input.learners).map((l, k) => { const [name = "", pct] = l.split("|").map((x) => x.trim()); const p = Number(pct); return { id: k + 1, name, pct: Number.isFinite(p) && pct !== "" ? p : null }; });
  const roster = () => people.map((p) => ({ learner: p.id, percent: p.pct, level: p.pct == null ? null : levelFromPercent(p.pct) }));
  const d = { focus: "", comments: {} as Record<number, string>, summary: "", issues: [] as string[], audit: "" };
  const view = () => ({ focus: d.focus, roster: roster(), comments: d.comments, summary: d.summary, issues: d.issues });
  const mission = `Grade ${input.grade} ${input.subject} term progress report (${input.topic}), South African CAPS levels 1-7. Teacher request: ${input.instructions || "none"}.`;
  const readDoc = (a: string) => tool(a, "read_document", "Read the roster (with deterministic CAPS levels) and everything written so far.", z.object({}), view);
  const setComments = (a: string) => tool(a, "write_comments", "Write one comment per learner number.", z.object({ comments: z.array(z.object({ learner: z.number(), comment: z.string() })) }), (x) => { x.comments.forEach((c: any) => (d.comments[c.learner] = c.comment)); return { ok: true, written: x.comments.length }; });
  await run([
    new LlmAgent({ name: "planner", model, description: "Plans the report", instruction: `You are the Planner. Mission: ${mission} Call read_document, then set_focus with one sentence on the tone and focus for the comments. Reply "done".`,
      tools: [readDoc("planner"), tool("planner", "set_focus", "Set the comment focus.", z.object({ focus: z.string() }), (x) => { d.focus = x.focus; return { ok: true }; })] }),
    new LlmAgent({ name: "writer", model, description: "Writes comments", instruction: `You are the Writer. Mission: ${mission} Call read_document. Call write_comments with one short (max 20 words), specific, encouraging comment per learner that matches their CAPS level; for a learner with no percent, write "Result outstanding — no comment yet.". Then call write_summary with a 2-sentence class summary. Reply "done".`,
      tools: [readDoc("writer"), setComments("writer"), tool("writer", "write_summary", "Write the class summary.", z.object({ summary: z.string() }), (x) => { d.summary = x.summary; return { ok: true }; })] }),
    new LlmAgent({ name: "reviewer", model, description: "Reviews comments", instruction: `You are the Reviewer. Mission: ${mission} Call read_document. Flag with flag_issue any comment that does not fit the learner's level, is missing, or is unkind. Do not invent problems. Reply "done".`,
      tools: [readDoc("reviewer"), tool("reviewer", "flag_issue", "Flag a problem.", z.object({ learner: z.number(), issue: z.string() }), (x) => { d.issues.push(`Learner ${x.learner}: ${x.issue}`); return { ok: true }; })] }),
    new LlmAgent({ name: "corrector", model, description: "Fixes comments", instruction: `You are the Corrector. Mission: ${mission} Call read_document. For each issue, rewrite only those learners' comments with write_comments. If there are no issues, change nothing. Reply "done".`,
      tools: [readDoc("corrector"), setComments("corrector")] }),
    new LlmAgent({ name: "verifier", model, description: "Final check", instruction: `You are the Verifier. Mission: ${mission} Call read_document, confirm every learner has a comment that fits their level, then call report_audit. Reply "done".`,
      tools: [readDoc("verifier"), tool("verifier", "report_audit", "Report the final audit.", z.object({ consistent: z.boolean(), summary: z.string() }), (x) => { d.audit = x.summary; return { ok: true }; })] }),
  ]);
  if (!Object.keys(d.comments).length) throw new Error("The agents did not write any comments");
  return { kind: "report", comments: people.map((p) => ({ name: p.name, comment: d.comments[p.id] ?? "" })), summary: [d.summary, d.audit && `Verifier: ${d.audit}`].filter(Boolean).join("\n") };
}

export const MAX_REVIEW_ROUNDS = 3;

/** `inject` is for fault-injection tests only: replaces the Writer's draft before review. */
export async function runRegisterTeam(input: MissionInput, send: (m: AdkStreamMsg) => void, inject?: { summary: string }): Promise<RegisterContent> {
  const { tool, run, model } = kit(send);
  const ls = lines(input.learners);
  const maxLine = ls.find((l) => /^max\s*\|/i.test(l));
  const maxes = maxLine ? parseMarks(maxLine.split("|")[1] ?? "") : [];
  const maxTotal = maxes.length && maxes.every((m) => m != null) ? computeTotal(maxes) : null;
  // Learners are numbered; names never go to the model.
  const rows = ls.filter((l) => l !== maxLine).map((l, k) => {
    const [, marks = "", recorded = ""] = l.split("|").map((x) => x.trim());
    const m = parseMarks(marks);
    const total = computeTotal(m);
    return { learner: k + 1, marks: m, recorded: recorded === "" ? null : Number(recorded), calculated: total, missing: m.map((x, q) => (x == null ? `Q${q + 1}` : null)).filter(Boolean), over: m.map((x, q) => (x != null && maxes[q] != null && x > (maxes[q] as number) ? `Q${q + 1}` : null)).filter(Boolean) };
  });
  const complete = rows.filter((r) => r.calculated != null).map((r) => r.calculated as number);
  // Exact facts every agent must agree with (rounded to 1 decimal, like the document).
  const facts = {
    learners: rows.length, maxTotal,
    verifiedTotals: rows.filter((r) => r.calculated != null && r.recorded === r.calculated).length,
    mismatchedTotals: rows.filter((r) => r.calculated != null && r.recorded != null && r.recorded !== r.calculated).map((r) => r.learner),
    missingMarks: rows.filter((r) => r.missing.length).map((r) => r.learner),
    classAverage: complete.length ? Math.round((complete.reduce((a, b) => a + b, 0) / complete.length) * 10) / 10 : null,
  };
  type Issue = { id: number; text: string; open: boolean; round: number };
  const d = { plan: "", summary: "", issues: [] as Issue[], audit: "", consistent: false };
  const mission = `Grade ${input.grade} ${input.subject} assessment register (${input.topic}). Learner marks were recorded by the teacher and confirmed from the photo: NEVER change a mark; mismatched totals are only flagged as proposals for the teacher. Teacher request: ${input.instructions || "none"}.`;
  const view = () => ({ plan: d.plan, summary: d.summary, issues: d.issues });
  const readDoc = (a: string) => tool(a, "read_document", "Read what colleagues have written, including review issues and whether they are open.", z.object({}), view);
  const check = (a: string) => tool(a, "check_register", "Deterministically recompute totals, list missing/out-of-range marks and the exact facts the summary must state.", z.object({}), () => ({ facts, rows: rows.map((r) => ({ ...r, mismatch: r.calculated != null && r.recorded != null && r.recorded !== r.calculated })) }));
  const write = (a: string) => tool(a, "write_summary", "Write the moderation summary (3-4 short lines). Use only numbers from check_register facts.", z.object({ summary: z.string() }), (x) => { d.summary = x.summary; return { ok: true }; });
  await run([
    new LlmAgent({ name: "planner", model, description: "Plans moderation", instruction: `You are the Planner. Mission: ${mission} Call check_register, then set_plan with one sentence on what moderation must focus on. Reply "done".`,
      tools: [check("planner"), tool("planner", "set_plan", "Set the moderation plan.", z.object({ plan: z.string() }), (x) => { d.plan = x.plan; return { ok: true }; })] }),
    new LlmAgent({ name: "writer", model, description: "Writes moderation summary", instruction: `You are the Writer. Mission: ${mission} Call read_document and check_register, then write_summary: counts of verified totals, mismatched totals (refer to learners by number), missing marks, and the class average. Reply "done".`,
      tools: [readDoc("writer"), check("writer"), write("writer")] }),
  ]);
  if (inject) d.summary = inject.summary;
  // Bounded Reviewer -> Corrector -> Reviewer loop: ends when a review round leaves no open issues.
  let rounds = 0;
  for (let round = 1; round <= MAX_REVIEW_ROUNDS; round++) {
    rounds = round;
    send({ type: "log", agent: "reviewer", text: `Review round ${round} of max ${MAX_REVIEW_ROUNDS}` });
    await run([new LlmAgent({ name: "reviewer", model, description: "Reviews summary", instruction: `You are the Reviewer, review round ${round}. Mission: ${mission} Call read_document and check_register. For each previously open issue that is now fixed, call resolve_issue. Then flag with flag_issue every remaining number or statement in the summary that disagrees with check_register facts (exact class average to 1 decimal, counts, learner numbers), and any changed or invented mark. Do not invent problems. Reply "done".`,
      tools: [readDoc("reviewer"), check("reviewer"),
        tool("reviewer", "flag_issue", "Flag a problem.", z.object({ issue: z.string() }), (x) => { const it = { id: d.issues.length + 1, text: x.issue, open: true, round }; d.issues.push(it); return { ok: true, id: it.id }; }),
        tool("reviewer", "resolve_issue", "Mark an earlier issue as fixed.", z.object({ id: z.number() }), (x) => { const it = d.issues.find((i) => i.id === x.id); if (it) it.open = false; return { ok: !!it }; })] })]);
    const open = d.issues.filter((i) => i.open);
    send({ type: "decision", agent: "reviewer", tool: "review_round", args: { round }, result: { open: open.length } });
    if (!open.length) break;
    if (round === MAX_REVIEW_ROUNDS) { send({ type: "log", agent: "reviewer", text: `Stopped after ${round} rounds with ${open.length} open issue(s) — teacher review needed` }); break; }
    await run([new LlmAgent({ name: "corrector", model, description: "Fixes summary", instruction: `You are the Corrector, round ${round}. Mission: ${mission} Call read_document and check_register, then rewrite the summary with write_summary so every open issue is fixed. You may only fix wording and calculated figures; never change a learner's mark. Reply "done".`,
      tools: [readDoc("corrector"), check("corrector"), write("corrector")] })]);
  }
  await run([new LlmAgent({ name: "verifier", model, description: "Final check", instruction: `You are the Verifier. Mission: ${mission} Call read_document and check_register. Confirm every learner is accounted for, no mark was changed and the summary matches the facts, then call report_audit. Reply "done".`,
    tools: [readDoc("verifier"), check("verifier"), tool("verifier", "report_audit", "Report the final audit.", z.object({ consistent: z.boolean(), summary: z.string() }), (x) => { d.audit = x.summary; d.consistent = !!x.consistent; return { ok: true }; })] })]);
  if (!d.summary) throw new Error("The agents did not write a moderation summary");
  const openIssues = d.issues.filter((i) => i.open).map((i) => i.text);
  return { kind: "register", summary: [d.summary, d.audit && `Verifier: ${d.audit}`].filter(Boolean).join("\n"), rounds, issues: d.issues.length, openIssues, consistent: d.consistent && !openIssues.length };
}
