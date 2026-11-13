// Server-authoritative intake missions, persisted in Lovable Cloud (table intake_missions)
// so paused missions survive reloads and server restarts. Only the server (service role)
// touches the table; the browser holds just the mission id. Personal data is never logged.
import type { Answers, Confirmed, Extraction, Question, Stage } from "./logic";
import type { LessonContent, RegisterContent } from "../adk/content";
import type { Json } from "@/integrations/supabase/types";

export interface IntakeMission {
  id: string; createdAt: number; updatedAt: number; stage: Stage;
  image: { mime: string; dataUrl: string };
  extraction: Extraction; questions: Question[]; answers: Answers;
  confirmed?: Confirmed; register?: RegisterContent; plan?: LessonContent; error?: string;
  history: { at: number; stage: Stage; note: string }[];
}
const TTL_DAYS = 30;
const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

export async function save(m: IntakeMission) {
  const { error } = await (await db()).from("intake_missions").upsert({
    id: m.id, stage: m.stage, data: m as unknown as Json,
    created_at: new Date(m.createdAt).toISOString(), updated_at: new Date(m.updatedAt).toISOString(),
  });
  if (error) throw new Error(`Could not save mission: ${error.message}`);
}
export async function put(m: IntakeMission) {
  await save(m);
  // Housekeeping: drop missions untouched for TTL_DAYS.
  await (await db()).from("intake_missions").delete().lt("updated_at", new Date(Date.now() - TTL_DAYS * 864e5).toISOString());
}
export async function get(id: string): Promise<IntakeMission | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const { data, error } = await (await db()).from("intake_missions").select("data").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load mission: ${error.message}`);
  return (data?.data as unknown as IntakeMission) ?? undefined;
}
export async function move(m: IntakeMission, stage: Stage, note: string) {
  m.stage = stage; m.updatedAt = Date.now(); m.history.push({ at: m.updatedAt, stage, note });
  await save(m);
}
