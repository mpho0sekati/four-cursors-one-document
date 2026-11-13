/* eslint-disable @typescript-eslint/no-explicit-any */
// ADK model adapter: lets @google/adk LlmAgents think through the Lovable AI Gateway
// (OpenAI-compatible chat completions with tool calling).
import { BaseLlm } from "@google/adk/dist/web/index_web.js";
import type { LlmRequest, LlmResponse } from "@google/adk";

const lowerTypes = (s: any): any => {
  if (Array.isArray(s)) return s.map(lowerTypes);
  if (!s || typeof s !== "object") return s;
  const o: any = {};
  for (const [k, v] of Object.entries(s)) o[k] = k === "type" && typeof v === "string" ? v.toLowerCase() : lowerTypes(v);
  return o;
};

export class GatewayLlm extends (BaseLlm as any) {
  constructor(model = "google/gemini-3.8-flash") { super({ model }); }
  async connect(): Promise<never> { throw new Error("Live connections are not supported"); }

  async *generateContentAsync(req: LlmRequest): AsyncGenerator<LlmResponse, void> {
    const messages: any[] = [];
    const sys = req.config?.systemInstruction as any;
    const sysText = typeof sys === "string" ? sys : sys?.parts?.map((p: any) => p.text).join("\n");
    if (sysText) messages.push({ role: "system", content: sysText });
    for (const c of req.contents) {
      const parts = c.parts ?? [];
      const text = parts.filter((p) => p.text).map((p) => p.text).join("\n");
      const calls = parts.filter((p) => p.functionCall);
      const results = parts.filter((p) => p.functionResponse);
      if (c.role === "model") {
        messages.push({
          role: "assistant", content: text || null,
          ...(calls.length && { tool_calls: calls.map((p) => ({ id: p.functionCall!.id, type: "function", function: { name: p.functionCall!.name, arguments: JSON.stringify(p.functionCall!.args ?? {}) } })) }),
        });
      } else {
        results.forEach((p) => messages.push({ role: "tool", tool_call_id: p.functionResponse!.id, content: JSON.stringify(p.functionResponse!.response ?? {}) }));
        if (text) messages.push({ role: "user", content: text });
      }
    }
    const tools = (req.config?.tools ?? []).flatMap((t: any) => t.functionDeclarations ?? []).map((d: any) => ({
      type: "function", function: { name: d.name, description: d.description, parameters: lowerTypes(d.parameters ?? d.parametersJsonSchema ?? { type: "object", properties: {} }) },
    }));
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) { yield { errorCode: "NO_KEY", errorMessage: "LOVABLE_API_KEY is not set" }; return; }
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: (this as any).model, messages, ...(tools.length && { tools }) }),
    });
    if (!res.ok) { yield { errorCode: String(res.status), errorMessage: (await res.text()).slice(0, 300) }; return; }
    const msg = (await res.json()).choices?.[0]?.message ?? {};
    const parts: any[] = [];
    if (msg.content) parts.push({ text: msg.content });
    for (const tc of msg.tool_calls ?? []) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* keep empty */ }
      parts.push({ functionCall: { id: tc.id, name: tc.function.name, args } });
    }
    yield { content: { role: "model", parts: parts.length ? parts : [{ text: "" }] }, turnComplete: true };
  }
}
