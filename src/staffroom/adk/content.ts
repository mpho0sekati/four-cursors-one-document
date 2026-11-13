// Shared contract between the ADK agent team (server) and the lesson mission (browser).
export interface LessonContent {
  objectives: string[];
  activities: { phase: string; activity: string; minutes: number }[];
  assessment: string[];
  notes: string[];
}
/** Lines streamed from the ADK run so the teacher can watch the agents think. */
export type AdkStreamMsg =
  | { type: "log"; agent: string; text: string }
  | { type: "content"; content: LessonContent }
  | { type: "error"; message: string };
