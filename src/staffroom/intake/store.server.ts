// Server-authoritative intake missions. Kept in server memory (per running server);
// the browser only holds the mission id. Personal data is never written to logs.
import type { Answers, Confirmed, Extraction, Question, Stage } from "./logic";
import type { LessonContent, RegisterContent } from "../adk/content";

export interface IntakeMission {
  id: string; createdAt: number; updatedAt: number; stage: Stage;
  image: { mime: string; dataUrl: string };
  extraction: Extraction; questions: Question[]; answers: Answers;
  confirmed?: Confirmed; register?: RegisterContent; plan?: LessonContent; error?: string;
  history: { at: number; stage: Stage; note: string }[];
}
const g = globalThis as unknown as { __intake?: Map<string, IntakeMission> };
const missions = (g.__intake ??= new Map());
const TTL = 6 * 60 * 60 * 1000;

export function put(m: IntakeMission) {
  for (const [k, v] of missions) if (Date.now() - v.updatedAt > TTL) missions.delete(k);
  missions.set(m.id, m);
}
export const get = (id: string) => missions.get(id);
export function move(m: IntakeMission, stage: Stage, note: string) {
  m.stage = stage; m.updatedAt = Date.now(); m.history.push({ at: m.updatedAt, stage, note });
}
