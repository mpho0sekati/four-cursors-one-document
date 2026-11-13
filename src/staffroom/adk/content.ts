// Shared contract between the ADK agent teams (server) and the missions (browser).
export interface LessonContent {
  objectives: string[];
  activities: { phase: string; activity: string; minutes: number }[];
  assessment: string[];
  notes: string[];
}
/** AI-written words for the progress report; levels stay deterministic. */
export interface ReportContent { kind: "report"; comments: { name: string; comment: string }[]; summary: string }
/** AI-written moderation notes for the register; totals stay deterministic. */
export interface RegisterContent { kind: "register"; summary: string }
export type MissionContent = LessonContent | ReportContent | RegisterContent;
export const isReport = (c?: MissionContent): c is ReportContent => !!c && "kind" in c && c.kind === "report";
export const isRegister = (c?: MissionContent): c is RegisterContent => !!c && "kind" in c && c.kind === "register";
export const isLesson = (c?: MissionContent): c is LessonContent => !!c && !("kind" in c);
/** Lines streamed from the ADK run so the teacher can watch the agents think. */
export type AdkStreamMsg =
  | { type: "log"; agent: string; text: string }
  /** One real tool call made by an ADK agent; the browser turns it into cursor work. */
  | { type: "decision"; agent: string; tool: string; args: Record<string, unknown>; result: unknown }
  | { type: "content"; content: MissionContent }
  | { type: "error"; message: string };
