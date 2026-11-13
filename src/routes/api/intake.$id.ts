import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { AdkStreamMsg, LessonContent, RegisterContent } from "@/staffroom/adk/content";
import { cleanGrade, confirm, remedialMission, runGate, STALE_RUN_MS, toRegisterLearners, unanswered } from "@/staffroom/intake/logic";
import type { IntakeMission } from "@/staffroom/intake/store.server";
import type { MissionInput } from "@/staffroom/types";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("answer"), answers: z.record(z.string().max(40), z.number().min(0).max(1000).nullable()) }),
  z.object({ action: z.literal("run"), stage: z.enum(["register", "plan"]) }),
  z.object({ action: z.literal("approve") }),
]);

function registerInput(m: IntakeMission): MissionInput {
  const x = m.extraction;
  return { type: "register", teacher: "Teacher", school: "", grade: cleanGrade(x.grade || ""), subject: x.subject || "Mathematics", topic: x.topic || x.title || "Class test", duration: 40, learners: toRegisterLearners(m.confirmed!), instructions: "Register transcribed from a photographed handwritten marksheet; uncertain entries were confirmed by the teacher." };
}
function view(m: IntakeMission, withImage = false) {
  const { image, ...rest } = m;
  const running = m.stage === "REGISTER_RUNNING" || m.stage === "PLAN_RUNNING";
  return { ...rest, stale: running && Date.now() - m.updatedAt > STALE_RUN_MS, open: unanswered(m.questions, m.answers).map((q) => q.id), registerInput: m.confirmed ? registerInput(m) : null,
    planInput: m.confirmed && m.register ? remedialMission(m.extraction, m.confirmed) : null, ...(withImage && { image }) };
}

// Server-authoritative intake mission: teacher answers, register run, plan run, approval.
export const Route = createFileRoute("/api/intake/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const m = await (await import("@/staffroom/intake/store.server")).get(params.id);
        if (!m) return Response.json({ error: "Mission not found (it may have expired)" }, { status: 404 });
        return Response.json(view(m, new URL(request.url).searchParams.has("image")));
      },
      POST: async ({ params, request }) => {
        const store = await import("@/staffroom/intake/store.server");
        const m = await store.get(params.id);
        if (!m) return Response.json({ error: "Mission not found (it may have expired)" }, { status: 404 });
        const a = Action.safeParse(await request.json().catch(() => null));
        if (!a.success) return Response.json({ error: "Invalid action" }, { status: 400 });
        try { return await handle(store, m, a.data); }
        catch (e) {
          if (e instanceof store.MissionConflict) return Response.json({ error: e.message, conflict: true }, { status: 409 });
          throw e;
        }
      },
    },
  },
});

type Store = typeof import("@/staffroom/intake/store.server");
async function handle(store: Store, m: IntakeMission, act: z.infer<typeof Action>): Promise<Response> {
        if (act.action === "answer") {
          if (!["WAITING_FOR_TEACHER", "READY_FOR_REGISTER"].includes(m.stage)) return Response.json({ error: "Answers are locked once the register is built" }, { status: 409 });
          const known = new Set(m.questions.map((q) => q.id));
          for (const [k, v] of Object.entries(act.answers)) if (known.has(k)) m.answers[k] = v;
          if (unanswered(m.questions, m.answers).length) { await store.move(m, "WAITING_FOR_TEACHER", "Teacher answered some questions"); }
          else { m.confirmed = confirm(m.extraction, m.questions, m.answers); await store.move(m, "READY_FOR_REGISTER", "Teacher confirmed every uncertain entry"); }
          return Response.json(view(m));
        }
        if (act.action === "approve") {
          if (m.stage !== "PLAN_READY") return Response.json({ error: "The plan is not ready for approval" }, { status: 409 });
          await store.move(m, "APPROVED", "Teacher approved the register and remedial plan");
          return Response.json(view(m));
        }
        // run
        const isReg = act.stage === "register";
        const gate = runGate(m.stage, act.stage, m.updatedAt, !!m.register);
        if (!gate.ok) return Response.json({ error: gate.error }, { status: 409 });
        if (isReg && !m.confirmed) m.confirmed = confirm(m.extraction, m.questions, m.answers);
        const input = isReg ? registerInput(m) : remedialMission(m.extraction, m.confirmed!);
        delete m.error;
        // Claim the run atomically: a second request racing this one gets a 409 conflict, not a second agent team.
        await store.move(m, isReg ? "REGISTER_RUNNING" : "PLAN_RUNNING", `Agents started the ${act.stage}`);
        const run = isReg ? (await import("@/staffroom/adk/recordsTeam.server")).runRegisterTeam : (await import("@/staffroom/adk/team.server")).runLessonTeam;
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(c) {
            const send = (x: AdkStreamMsg) => c.enqueue(enc.encode(JSON.stringify(x) + "\n"));
            try {
              const content = await run(input, send);
              if (isReg) { const reg = content as RegisterContent; m.register = reg; await store.move(m, "REGISTER_VERIFIED", `Register verified after ${reg.rounds ?? 1} review round(s)`); }
              else { m.plan = content as LessonContent; await store.move(m, "PLAN_READY", "Remedial plan written from the verified register"); }
              send({ type: "content", content });
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Agent run failed";
              // If another request already took over this mission, leave its state alone.
              if (!(e instanceof store.MissionConflict)) {
                m.error = msg;
                await store.move(m, isReg ? "READY_FOR_REGISTER" : "REGISTER_VERIFIED", `Run failed: ${msg}`).catch(() => {});
              }
              send({ type: "error", message: msg });
            }
            c.close();
          },
        });
        return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
}
