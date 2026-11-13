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

export async function runRegisterTeam(input: MissionInput, send: (m: AdkStreamMsg) => void): Promise<RegisterContent> {
  const { tool, run, model } = kit(send);
  const ls = lines(input.learners);
  const maxLine = ls.find((l) => /^max\s*\|/i.test(l));
  const maxes = maxLine ? parseMarks(maxLine.split("|")[1] ?? "") : [];
  const rows = ls.filter((l) => l !== maxLine).map((l, k) => {
    const [, marks = "", recorded = ""] = l.split("|").map((x) => x.trim());
    const m = parseMarks(marks);
    const total = computeTotal(m);
    return { learner: k + 1, marks: m, recorded: recorded === "" ? null : Number(recorded), calculated: total, missing: m.map((x, q) => (x == null ? `Q${q + 1}` : null)).filter(Boolean), over: m.map((x, q) => (x != null && maxes[q] != null && x > (maxes[q] as number) ? `Q${q + 1}` : null)).filter(Boolean) };
  });
  const d = { plan: "", summary: "", issues: [] as string[], audit: "" };
  const mission = `Grade ${input.grade} ${input.subject} assessment register (${input.topic}). Never invent marks; corrected totals are only proposals for the teacher. Teacher request: ${input.instructions || "none"}.`;
  const view = () => ({ plan: d.plan, summary: d.summary, issues: d.issues });
  const readDoc = (a: string) => tool(a, "read_document", "Read what colleagues have written.", z.object({}), view);
  const check = (a: string) => tool(a, "check_register", "Deterministically recompute every learner's total and list missing or out-of-range marks.", z.object({}), () => ({ maxes, rows: rows.map((r) => ({ ...r, mismatch: r.calculated != null && r.recorded != null && r.recorded !== r.calculated })) }));
  const write = (a: string) => tool(a, "write_summary", "Write the moderation summary (3-4 short lines).", z.object({ summary: z.string() }), (x) => { d.summary = x.summary; return { ok: true }; });
  await run([
    new LlmAgent({ name: "planner", model, description: "Plans moderation", instruction: `You are the Planner. Mission: ${mission} Call check_register, then set_plan with one sentence on what moderation must focus on. Reply "done".`,
      tools: [check("planner"), tool("planner", "set_plan", "Set the moderation plan.", z.object({ plan: z.string() }), (x) => { d.plan = x.plan; return { ok: true }; })] }),
    new LlmAgent({ name: "writer", model, description: "Writes moderation summary", instruction: `You are the Writer. Mission: ${mission} Call read_document and check_register, then write_summary: counts of verified totals, mismatched totals (refer to learners by number), missing marks, and the class average of complete totals. Reply "done".`,
      tools: [readDoc("writer"), check("writer"), write("writer")] }),
    new LlmAgent({ name: "reviewer", model, description: "Reviews summary", instruction: `You are the Reviewer. Mission: ${mission} Call read_document and check_register. Flag with flag_issue any number in the summary that disagrees with check_register, or any invented mark. Do not invent problems. Reply "done".`,
      tools: [readDoc("reviewer"), check("reviewer"), tool("reviewer", "flag_issue", "Flag a problem.", z.object({ issue: z.string() }), (x) => { d.issues.push(x.issue); return { ok: true }; })] }),
    new LlmAgent({ name: "corrector", model, description: "Fixes summary", instruction: `You are the Corrector. Mission: ${mission} Call read_document. If there are issues, call check_register and rewrite the summary with write_summary. Otherwise change nothing. Reply "done".`,
      tools: [readDoc("corrector"), check("corrector"), write("corrector")] }),
    new LlmAgent({ name: "verifier", model, description: "Final check", instruction: `You are the Verifier. Mission: ${mission} Call read_document and check_register, then report_audit. Reply "done".`,
      tools: [readDoc("verifier"), check("verifier"), tool("verifier", "report_audit", "Report the final audit.", z.object({ consistent: z.boolean(), summary: z.string() }), (x) => { d.audit = x.summary; return { ok: true }; })] }),
  ]);
  if (!d.summary) throw new Error("The agents did not write a moderation summary");
  return { kind: "register", summary: [d.summary, d.audit && `Verifier: ${d.audit}`].filter(Boolean).join("\n") };
}
