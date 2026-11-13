// Reads a photographed marksheet with a multimodal model. It only reports what it sees;
// unclear handwriting must be reported as unclear, never resolved by guessing.
import type { Extraction } from "./logic";

const cell = { type: "object", additionalProperties: false, required: ["value", "state", "confidence", "alternatives", "box"], properties: {
  value: { type: ["number", "null"] }, state: { type: "string", enum: ["clear", "unclear", "blank"] },
  confidence: { type: "number" }, alternatives: { type: "array", items: { type: "number" } },
  box: { type: ["array", "null"], items: { type: "number" } },
} };
const schema = { type: "object", additionalProperties: false, required: ["title", "grade", "subject", "topic", "maxes", "rows"], properties: {
  title: { type: "string" }, grade: { type: "string" }, subject: { type: "string" }, topic: { type: "string" },
  maxes: { type: "array", items: { type: ["number", "null"] } },
  rows: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "nameBox", "marks", "recorded"], properties: {
    name: { type: "string" }, nameBox: { type: ["array", "null"], items: { type: "number" } }, marks: { type: "array", items: cell }, recorded: cell,
  } } },
} };

const PROMPT = `You are reading a photographed, handwritten school marksheet. Transcribe exactly what is written.
Rules:
- One row per learner. "marks" = per-question marks in column order (exclude the total column). "recorded" = the total the teacher wrote.
- "maxes" = maximum mark per question if written in the headers (e.g. "Q1 /5" -> 5), else null.
- For every cell: state "clear" if you can read it with certainty; "unclear" if something is written but could be read in more than one way (smudged, overwritten, crossed out, ambiguous digits like 1/7, 3/8, 5/6); "blank" if nothing is written.
- For unclear cells: value = your best reading, alternatives = the other plausible readings, confidence below 0.8. NEVER present an unclear cell as clear.
- confidence: 0..1. box: [x, y, width, height] of the cell on the image, normalised 0-1000, or null.
- grade/subject/topic from the heading if present, else "".`;

export async function readMarksheet(dataUrl: string): Promise<Extraction> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.8-flash",
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }],
      response_format: { type: "json_schema", json_schema: { name: "marksheet", strict: true, schema } },
    }),
  });
  if (!res.ok) {
    const status = res.status;
    throw Object.assign(new Error(status === 402 ? "AI credits are used up — add credits to continue." : status === 429 ? "The AI is busy, try again in a minute." : `Could not read the photo (${status})`), { status });
  }
  const text: string = (await res.json()).choices?.[0]?.message?.content ?? "";
  const x = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim()) as Extraction;
  if (!Array.isArray(x.rows) || !x.rows.length) throw new Error("No learner rows were found on the photo");
  return x;
}
