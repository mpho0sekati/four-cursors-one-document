import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { buildQuestions, unanswered } from "@/staffroom/intake/logic";

const Body = z.object({ dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(8_000_000) });

// Create an intake mission from a photographed marksheet (real image understanding).
export const Route = createFileRoute("/api/intake")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const p = Body.safeParse(await request.json().catch(() => null));
        if (!p.success) return Response.json({ error: "Send a JPEG, PNG or WebP photo under 6 MB." }, { status: 400 });
        const { readMarksheet } = await import("@/staffroom/intake/vision.server");
        const store = await import("@/staffroom/intake/store.server");
        try {
          const extraction = await readMarksheet(p.data.dataUrl);
          const questions = buildQuestions(extraction);
          const now = Date.now();
          const stage = questions.length ? ("WAITING_FOR_TEACHER" as const) : ("READY_FOR_REGISTER" as const);
          const m = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, stage,
            image: { mime: p.data.dataUrl.slice(5, p.data.dataUrl.indexOf(";")), dataUrl: p.data.dataUrl }, extraction, questions, answers: {},
            history: [{ at: now, stage, note: `Read ${extraction.rows.length} rows; ${questions.length} question(s) for the teacher` }] };
          await store.put(m);
          console.log(`[intake] ${m.id} rows=${extraction.rows.length} questions=${questions.length}`);
          const { image: _i, ...pub } = m;
          return Response.json({ ...pub, open: unanswered(questions, {}).map((q) => q.id), registerInput: null, planInput: null });
        } catch (e) {
          const status = (e as { status?: number }).status ?? 500;
          return Response.json({ error: e instanceof Error ? e.message : "Could not read the photo" }, { status: status === 402 || status === 429 ? status : 502 });
        }
      },
    },
  },
});
