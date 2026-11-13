import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { AdkStreamMsg } from "@/staffroom/adk/content";

const Input = z.object({
  type: z.literal("lesson"), teacher: z.string().max(200), school: z.string().max(200), grade: z.string().max(20),
  subject: z.string().max(100), topic: z.string().max(200), duration: z.number().int().min(10).max(240),
  learners: z.string().max(5000), instructions: z.string().max(2000),
});

// Streams the ADK agent team's work as newline-delimited JSON.
export const Route = createFileRoute("/api/adk-mission")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Input.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid mission" }, { status: 400 });
        const { runLessonTeam } = await import("@/staffroom/adk/team.server");
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(c) {
            const send = (m: AdkStreamMsg) => c.enqueue(enc.encode(JSON.stringify(m) + "\n"));
            try { send({ type: "content", content: await runLessonTeam(parsed.data, send) }); }
            catch (e) { send({ type: "error", message: e instanceof Error ? e.message : "Agent run failed" }); }
            c.close();
          },
        });
        return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
      },
    },
  },
});
