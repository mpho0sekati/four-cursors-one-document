import { useSyncExternalStore } from "react";
import { AGENT_IDS } from "./agents";
import type { AgentEvent, AgentId, AgentState, DocStatus, Field, MissionInput, Row } from "./types";

export interface Control { running: boolean; paused: boolean; speed: 1 | 2 | 3; complete: boolean; regroup: boolean; done: number; total: number; /** Real AI agents produced this run (vs the scripted demo). */ live?: boolean }

export interface StaffroomState {
  input: MissionInput | null;
  title: string;
  status: DocStatus;
  order: string[];
  fields: Record<string, Field>;
  agents: Record<AgentId, AgentState>;
  log: AgentEvent[];
  control: Control;
  /** Wireframe preview while the Planner drags out a new section. */
  blueprint: { label: string; kind: Field["kind"] } | null;
}

const freshAgents = () =>
  Object.fromEntries(
    AGENT_IDS.map((id) => [id, { id, target: null, status: "idle", bubble: "", currentTask: "Standing by", completed: 0, actions: [], clicks: 0, typing: false, action: null } satisfies AgentState]),
  ) as unknown as Record<AgentId, AgentState>;

export function initialState(input: MissionInput | null = null, title = ""): StaffroomState {
  return {
    input, title, status: "empty", order: [], fields: {}, agents: freshAgents(), log: [], blueprint: null,
    control: { running: false, paused: false, speed: 1, complete: false, regroup: false, done: 0, total: 0 },
  };
}

export const splitTarget = (t: string) => {
  const [fieldId = "", row] = t.split("::");
  return { fieldId, rowId: row ? t : null };
};

function patchRow(f: Field, rowId: string, fn: (r: Row) => Row) {
  f.rows = f.rows.map((r) => (r.id === rowId ? fn({ ...r, cells: { ...r.cells } }) : r));
}

/** Renderer-side reducer: every visible document change flows through here. */
export function applyEvent(s: StaffroomState, e: AgentEvent): StaffroomState {
  const st: StaffroomState = { ...s, fields: { ...s.fields }, agents: { ...s.agents } };
  if (e.status !== "progress") st.log = [...s.log.slice(-299), e];
  const p = e.payload;
  const done = e.status === "completed";
  const { fieldId, rowId } = splitTarget(e.targetId);
  let f: Field | null = null;
  const cur = st.fields[fieldId];
  if (cur) { f = { ...cur }; st.fields[fieldId] = f; }
  const actor = e.agentId === "teacher" ? null : e.agentId;
  const a = actor ? { ...st.agents[actor] } : null;
  if (a && actor) {
    st.agents[actor] = a;
    if (p.label) a.currentTask = p.label;
    if (e.action !== "navigate_to_field") a.action = done ? null : e.action;
    if (done && e.summary) { a.completed++; a.actions = [e.summary, ...a.actions].slice(0, 4); }
  }

  switch (e.action) {
    case "navigate_to_field":
      if (a) { a.target = e.targetId; a.status = "moving"; a.bubble = p.bubble ?? ""; }
      break;
    case "focus_field":
      if (a) { a.clicks++; a.status = "working"; }
      if (f && actor) f.activeAgent = actor;
      break;
    case "create_section": {
      const nf = p.field as Field;
      if (!done) { st.blueprint = { label: nf.label, kind: nf.kind }; break; }
      st.blueprint = null;
      if (!st.fields[nf.id]) { st.fields[nf.id] = { ...nf }; st.order = [...st.order, nf.id]; }
      if (st.status === "empty") st.status = "draft";
      break;
    }
    case "type_text":
      if (f) { f.text = p.text; f.status = done ? "complete" : "editing"; }
      if (a) a.typing = !done;
      break;
    case "populate_table":
      if (f) {
        if (p.row) f.rows = [...f.rows, p.row as Row];
        if (rowId && p.patch) patchRow(f, rowId, (r) => ({ ...r, cells: { ...r.cells, ...p.patch } }));
        f.status = done ? "complete" : "editing";
      }
      break;
    case "highlight_field":
      if (f && actor) f.activeAgent = actor;
      break;
    case "validate_field":
      if (f && !done) {
        if (rowId) patchRow(f, rowId, (r) => ({ ...r, prev: r.status === "checking" ? r.prev : r.status, status: "checking" }));
        else f.status = "checking";
      }
      break;
    case "flag_issue":
      if (f) {
        if (rowId) patchRow(f, rowId, (r) => ({ ...r, status: p.rowStatus ?? "warning", note: p.issue }));
        f.status = "warning";
        f.issues = [...f.issues, p.issue];
      }
      break;
    case "correct_field":
      if (f) {
        if (rowId) patchRow(f, rowId, (r) => ({ ...r, cells: { ...r.cells, ...(p.patch ?? {}) }, status: p.rowStatus ?? "corrected", note: p.note ?? r.note }));
        if (p.text !== undefined) f.text = p.text;
        if (done) {
          if (p.note) f.note = p.note;
          if (p.issue) f.issues = f.issues.filter((i) => i !== p.issue);
          if (p.clearIssues) { f.issues = []; f.rows = f.rows.map((r) => (r.status === "warning" ? { ...r, status: "corrected" } : r)); }
          if (!f.rows.some((r) => r.status === "warning")) f.status = "corrected";
        }
      }
      break;
    case "approve_field":
      if (e.agentId === "teacher") {
        for (const id of st.order) {
          const ff = { ...st.fields[id]! };
          ff.rows = ff.rows.map((r): Row => r.status === "proposed" ? { ...r, cells: { ...r.cells, recorded: r.cells.proposed ?? "", proposed: "" }, status: "approved" as const, note: "Correction approved by teacher" } : r);
          st.fields[id] = ff;
        }
        st.status = p.status;
      } else if (f) {
        if (rowId) patchRow(f, rowId, (r) => ({ ...r, status: p.keepStatus ? (r.prev ?? r.status) : "ok", note: p.note ?? r.note }));
        else { f.status = "approved"; f.issues = []; }
      }
      break;
    case "generate_document":
      if (done) st.status = p.status;
      break;
  }
  if (done) {
    if (f && f.activeAgent === actor) f.activeAgent = null;
    if (a) a.typing = false;
  }
  return st;
}

type Listener = () => void;
type EventListener = (e: AgentEvent) => void;
const eventListeners = new Set<EventListener>();
let state = initialState();
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());

export const staffroom = {
  get: () => state,
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
  dispatch(e: AgentEvent) { state = applyEvent(state, e); notify(); eventListeners.forEach((l) => l(e)); },
  /** Side-effect subscribers (e.g. sound) that react to individual events. */
  onEvent(l: EventListener) { eventListeners.add(l); return () => { eventListeners.delete(l); }; },
  patch(fn: (s: StaffroomState) => StaffroomState) { state = fn(state); notify(); },
  reset(next: StaffroomState) { state = next; notify(); },
};

export function useStaffroom<T>(sel: (s: StaffroomState) => T): T {
  return useSyncExternalStore(staffroom.subscribe, () => sel(staffroom.get()), () => sel(staffroom.get()));
}
