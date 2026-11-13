/* eslint-disable @typescript-eslint/no-explicit-any */
// The AI Staffroom agent team, built with Google ADK (adk-js).
// Five LlmAgents run in a SequentialAgent and share one draft (the "blackboard"):
// each agent reads what the previous colleagues wrote through its tools.
import { FunctionTool, InMemoryRunner, LlmAgent, SequentialAgent } from "@google/adk/dist/web/index_web.js";
import { z } from "zod";
import type { MissionInput } from "../types";
import { checkLessonDuration } from "../validation";
import type { AdkStreamMsg, LessonContent } from "./content";
import { GatewayLlm } from "./gatewayLlm.server";

export async function runLessonTeam(input: MissionInput, send: (m: AdkStreamMsg) => void): Promise<LessonContent> {
  const draft: LessonContent & { outline: string[]; issues: string[]; audit: string } = {
    outline: [], objectives: [], activities: [], assessment: [], notes: [], issues: [], audit: "",
  };
  const log = (agent: string, text: string) => send({ type: "log", agent, text });
  const tool = (agent: string, name: string, description: string, parameters: any, run: (a: any) => unknown) =>
    new FunctionTool({ name, description, parameters, execute: (a: any) => { const r = run(a); log(agent, `${name} → ${JSON.stringify(r).slice(0, 140)}`); return r; } });
  const model = new GatewayLlm() as any;
  const mission = `Grade ${input.grade} ${input.subject} lesson on "${input.topic}", exactly ${input.duration} minutes, for South African learners (CAPS). Teacher request: ${input.instructions || "none"}.`;
  const view = () => ({ outline: draft.outline, objectives: draft.objectives, activities: draft.activities, assessment: draft.assessment, notes: draft.notes, issues: draft.issues });
  const readDoc = (agent: string) => tool(agent, "read_document", "Read everything the other colleagues have written so far.", z.object({}), () => view());

  const planner = new LlmAgent({
    name: "planner", model, description: "Plans the lesson structure",
    instruction: `You are the Planner. Mission: ${mission} Call set_outline once with 3-5 lesson phase names in order. Then reply "done".`,
    tools: [tool("planner", "set_outline", "Set the lesson phases in order.", z.object({ phases: z.array(z.string()) }), (a) => { draft.outline = a.phases; return { ok: true }; })],
  });
  const writer = new LlmAgent({
    name: "writer", model, description: "Writes the lesson content",
    instruction: `You are the Writer. Mission: ${mission} First call read_document to see the Planner's outline. Then call write_objectives (3 items), write_activities (one row per outline phase, concrete activity, whole-number minutes), write_assessment (3-4 questions) and write_notes (2-3 practical notes). Then reply "done".`,
    tools: [
      readDoc("writer"),
      tool("writer", "write_objectives", "Write learning objectives.", z.object({ items: z.array(z.string()) }), (a) => { draft.objectives = a.items; return { ok: true }; }),
      tool("writer", "write_activities", "Write the activity table.", z.object({ rows: z.array(z.object({ phase: z.string(), activity: z.string(), minutes: z.number() })) }), (a) => { draft.activities = a.rows; return { ok: true, total: a.rows.reduce((s: number, r: any) => s + r.minutes, 0) }; }),
      tool("writer", "write_assessment", "Write assessment questions.", z.object({ questions: z.array(z.string()) }), (a) => { draft.assessment = a.questions; return { ok: true }; }),
      tool("writer", "write_notes", "Write teacher notes.", z.object({ items: z.array(z.string()) }), (a) => { draft.notes = a.items; return { ok: true }; }),
    ],
  });
  const reviewer = new LlmAgent({
    name: "reviewer", model, description: "Reviews the draft",
    instruction: `You are the Reviewer. Mission: ${mission} Call read_document and check_timings. Flag every real problem with flag_issue (wrong timing, content not matching the grade/topic, missing sections). Do not invent problems. Then reply "done".`,
    tools: [
      readDoc("reviewer"),
      tool("reviewer", "check_timings", "Deterministically sum activity minutes against the lesson duration.", z.object({}), () => checkLessonDuration(draft.activities.map((r) => r.minutes), input.duration)),
      tool("reviewer", "flag_issue", "Flag a problem for the Corrector.", z.object({ issue: z.string() }), (a) => { draft.issues.push(a.issue); return { ok: true }; }),
    ],
  });
  const corrector = new LlmAgent({
    name: "corrector", model, description: "Fixes flagged issues",
    instruction: `You are the Corrector. Mission: ${mission} Call read_document. For each issue in "issues", rewrite the affected section with the matching write_ tool so the issue is resolved; activity minutes must total exactly ${input.duration}. If there are no issues, change nothing. Then reply "done".`,
    tools: [
      readDoc("corrector"),
      tool("corrector", "write_activities", "Replace the activity table.", z.object({ rows: z.array(z.object({ phase: z.string(), activity: z.string(), minutes: z.number() })) }), (a) => { draft.activities = a.rows; return { ok: true }; }),
      tool("corrector", "write_objectives", "Replace objectives.", z.object({ items: z.array(z.string()) }), (a) => { draft.objectives = a.items; return { ok: true }; }),
      tool("corrector", "write_assessment", "Replace assessment questions.", z.object({ questions: z.array(z.string()) }), (a) => { draft.assessment = a.questions; return { ok: true }; }),
    ],
  });
  const verifier = new LlmAgent({
    name: "verifier", model, description: "Final consistency check",
    instruction: `You are the Verifier, the final check. Mission: ${mission} Call read_document and check_timings, then call report_audit with whether the document is consistent with the mission and a one-sentence summary. Then reply "done".`,
    tools: [
      readDoc("verifier"),
      tool("verifier", "check_timings", "Sum activity minutes against the lesson duration.", z.object({}), () => checkLessonDuration(draft.activities.map((r) => r.minutes), input.duration)),
      tool("verifier", "report_audit", "Report the final audit.", z.object({ consistent: z.boolean(), summary: z.string() }), (a) => { draft.audit = a.summary; return { ok: true }; }),
    ],
  });

  const team = new SequentialAgent({ name: "staffroom", subAgents: [planner, writer, reviewer, corrector, verifier] });
  const runner = new InMemoryRunner({ agent: team, appName: "ai-staffroom" });
  const session = await runner.sessionService.createSession({ appName: "ai-staffroom", userId: "teacher" });
  for await (const ev of runner.runAsync({ userId: "teacher", sessionId: session.id, newMessage: { role: "user", parts: [{ text: "Start the mission." }] } })) {
    const e = ev as any;
    if (e.errorMessage) throw new Error(e.errorMessage);
    const t = e.content?.parts?.map((p: any) => p.text).filter(Boolean).join(" ");
    if (t && e.author) log(e.author, t.slice(0, 200));
  }
  if (!draft.activities.length) throw new Error("The agents did not produce any activities");
  return { objectives: draft.objectives, activities: draft.activities, assessment: draft.assessment, notes: [...draft.notes, ...(draft.audit ? [`Verifier: ${draft.audit}`] : [])] };
}
