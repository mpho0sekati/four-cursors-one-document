/* eslint-disable @typescript-eslint/no-explicit-any */
// Generic event contract. A future real-agent backend (ADK, CrewAI) can emit the
// same AgentEvent objects; the renderer only consumes these events.
export type AgentId = "planner" | "writer" | "reviewer" | "corrector";
export type ActorId = AgentId | "teacher";

export type ActionType =
  | "navigate_to_field"
  | "focus_field"
  | "create_section"
  | "type_text"
  | "populate_table"
  | "highlight_field"
  | "validate_field"
  | "flag_issue"
  | "correct_field"
  | "approve_field"
  | "generate_document";

export type EventStatus = "running" | "progress" | "completed" | "failed";
export type Payload = Record<string, any>;

export interface AgentEvent {
  id: string;
  agentId: ActorId;
  action: ActionType;
  targetId: string;
  payload: Payload;
  status: EventStatus;
  taskId?: string;
  summary?: string;
  at: number;
}

export interface Task {
  id: string;
  agentId: AgentId;
  action: ActionType;
  targetId: string;
  deps: string[];
  duration: number;
  status: "pending" | "running" | "done";
  payload: Payload;
  label: string;
  /** Waits until every non-afterAll task has finished. */
  afterAll?: boolean;
}

export type FieldStatus = "empty" | "editing" | "checking" | "complete" | "warning" | "corrected" | "approved";
export type RowStatus = "new" | "checking" | "ok" | "warning" | "corrected" | "proposed" | "missing" | "approved";

export interface Column { key: string; label: string; align?: "right" | "center" }
export interface Row { id: string; cells: Record<string, string>; status: RowStatus; note?: string }

export interface Field {
  id: string;
  label: string;
  kind: "text" | "table" | "kv";
  status: FieldStatus;
  text: string;
  rows: Row[];
  columns: Column[];
  issues: string[];
  note?: string;
  activeAgent: AgentId | null;
  placeholder?: string;
}

export type DocStatus = "empty" | "draft" | "provisional" | "approved";
export type MissionType = "lesson" | "report" | "register";

export interface MissionInput {
  type: MissionType;
  teacher: string;
  school: string;
  grade: string;
  subject: string;
  topic: string;
  duration: number;
  learners: string;
  instructions: string;
}

export interface AgentState {
  id: AgentId;
  target: string | null;
  status: "idle" | "moving" | "working" | "waiting" | "done";
  bubble: string;
  currentTask: string;
  completed: number;
  actions: string[];
  clicks: number;
  typing: boolean;
}

export interface CheckResult { ok: boolean; issue?: string; fix?: Payload; summary?: string }
