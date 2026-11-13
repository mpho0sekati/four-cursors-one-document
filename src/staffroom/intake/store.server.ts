// Server-authoritative intake missions, persisted in Lovable Cloud (table intake_missions)
// so paused missions survive reloads, server restarts and different server instances.
// Only the server (service role) touches the table; the browser holds just the mission id.
// Every change is a compare-and-set on updated_at, so two requests racing on the same
// mission (double-click, two tabs) cannot both win. Personal data is never logged.
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
/** Thrown when another request changed the mission first. */
export class MissionConflict extends Error {
  constructor() { super("This mission was just updated by another request. Refresh to see the latest state."); }
}
const TTL_DAYS = 30;
const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const iso = (t: number) => new Date(t).toISOString();

/** Create a brand-new mission (never overwrites an existing one). */
export async function put(m: IntakeMission) {
  const c = await db();
  const { error } = await c.from("intake_missions").insert({ id: m.id, stage: m.stage, data: m as unknown as Json, created_at: iso(m.createdAt), updated_at: iso(m.updatedAt) });
  if (error) throw new Error(`Could not save mission: ${error.message}`);
  // Housekeeping: drop missions untouched for TTL_DAYS.
  await c.from("intake_missions").delete().lt("updated_at", iso(Date.now() - TTL_DAYS * 864e5));
}
export async function get(id: string): Promise<IntakeMission | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const { data, error } = await (await db()).from("intake_missions").select("data").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load mission: ${error.message}`);
  return (data?.data as unknown as IntakeMission) ?? undefined;
}
/** Move to a new stage, but only if nobody else changed the mission since we loaded it. */
export async function move(m: IntakeMission, stage: Stage, note: string) {
  const prev = m.updatedAt;
  m.stage = stage; m.updatedAt = Math.max(Date.now(), prev + 1); m.history.push({ at: m.updatedAt, stage, note });
  const { data, error } = await (await db()).from("intake_missions")
    .update({ stage, data: m as unknown as Json, updated_at: iso(m.updatedAt) })
    .eq("id", m.id).eq("updated_at", iso(prev)).select("id");
  if (error) throw new Error(`Could not save mission: ${error.message}`);
  if (!data?.length) throw new MissionConflict();
}
