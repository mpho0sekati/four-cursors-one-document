import { useEffect, useState } from "react";
import { Camera, CheckCheck, Download, FileText, Loader2, RotateCcw, Upload } from "lucide-react";
import sampleUrl from "@/assets/sample-marksheet.jpg";
import { staffroom, useStaffroom } from "@/staffroom/DocumentStore";
import { simulation } from "@/staffroom/SimulationController";
import { analyse, type Box, type Confirmed, type Extraction, type Question, type Stage } from "@/staffroom/intake/logic";
import type { LessonContent, RegisterContent } from "@/staffroom/adk/content";
import type { MissionInput } from "@/staffroom/types";

interface View {
  id: string; stage: Stage; extraction: Extraction; questions: Question[]; answers: Record<string, number | null>; open: string[];
  confirmed?: Confirmed; register?: RegisterContent; plan?: LessonContent; error?: string;
  registerInput: MissionInput | null; planInput: MissionInput | null; history: { at: number; stage: Stage; note: string }[];
}
const KEY = "staffroom-intake";
const STAGE_LABEL: Record<Stage, string> = {
  WAITING_FOR_TEACHER: "Waiting for you", READY_FOR_REGISTER: "Ready to build register", REGISTER_RUNNING: "Agents building register",
  REGISTER_VERIFIED: "Register verified", PLAN_RUNNING: "Agents writing plan", PLAN_READY: "Plan ready for approval", APPROVED: "Approved", FAILED: "Failed",
};

async function toDataUrl(blob: Blob): Promise<string> {
  // Respect phone orientation, shrink to ≤1600px and re-encode as JPEG (also drops EXIF/GPS data).
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}
const api = async <T,>(url: string, body?: unknown): Promise<T> => {
  const r = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
};
function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function registerCsv(v: View) {
  const a = analyse(v.confirmed!);
  const q = v.confirmed!.maxes.map((m, i) => `Q${i + 1} (/${m ?? "?"})`);
  const lines = [["Learner", ...q, "Recorded total", "Calculated total", "Status"].join(",")];
  v.confirmed!.rows.forEach((r, i) => {
    const t = a.learners[i]!.total;
    const status = t == null ? "Missing mark - not estimated" : r.recorded == null ? "No recorded total" : r.recorded === t ? "Verified" : "Proposed correction - teacher approval required";
    lines.push([`"${r.name.replace(/"/g, "'")}"`, ...r.marks.map((m) => m ?? ""), r.recorded ?? "", t ?? "", status].join(","));
  });
  return lines.join("\n");
}
function planText(v: View) {
  const p = v.plan!, i = v.planInput!;
  return [`# ${i.topic}`, `Grade ${i.grade} ${i.subject} · ${i.duration} min`, "", i.instructions, "", "## Objectives", ...p.objectives.map((o) => `- ${o}`), "", "## Activities",
    ...p.activities.map((a) => `- ${a.phase} (${a.minutes} min): ${a.activity}`), "", "## Assessment", ...p.assessment.map((o) => `- ${o}`), "", "## Notes", ...p.notes.map((o) => `- ${o}`)].join("\n");
}

function Photo({ src, boxes, focus }: { src: string; boxes: Box[]; focus?: Box | null }) {
  return (
    <div className="relative overflow-hidden rounded-md border border-sidebar-border">
      <img src={src} alt="Your photographed marksheet" className="block w-full" />
      {boxes.map((b, k) => <div key={k} className="pointer-events-none absolute border border-sidebar-primary/40" style={{ left: `${b[0] / 10}%`, top: `${b[1] / 10}%`, width: `${b[2] / 10}%`, height: `${b[3] / 10}%` }} />)}
      {focus && <div className="pointer-events-none absolute animate-pulse rounded-sm border-2 border-corrector bg-corrector/20" style={{ left: `${focus[0] / 10}%`, top: `${focus[1] / 10}%`, width: `${focus[2] / 10}%`, height: `${focus[3] / 10}%` }} />}
    </div>
  );
}

export function IntakePanel() {
  const [v, setV] = useState<View | null>(null);
  const [img, setImg] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [logs, setLogs] = useState<{ agent: string; text: string }[]>([]);
  const [draft, setDraft] = useState<Record<string, number | null>>({});
  const [focus, setFocus] = useState<Box | null>(null);
  const docDone = useStaffroom((s) => s.control.complete);

  // Resume the same mission after a reload: the server holds the state.
  useEffect(() => {
    const id = localStorage.getItem(KEY);
    if (!id) return;
    api<View & { image?: { dataUrl: string } }>(`/api/intake/${id}?image`).then((m) => { setV(m); setImg(m.image?.dataUrl ?? ""); if (m.plan && m.planInput) simulation.start(m.planInput, m.plan); else if (m.register && m.registerInput) simulation.start(m.registerInput, m.register); }).catch(() => localStorage.removeItem(KEY));
  }, []);
  const refresh = async (id = v!.id) => setV(await api<View>(`/api/intake/${id}`));
  const guard = async (label: string, f: () => Promise<void>) => {
    setErr(""); setBusy(label);
    try { await f(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(""); }
  };

  const upload = (blob: Blob) => guard("Reading your marksheet…", async () => {
    simulation.reset(); // keep the scripted demo out of a live intake
    const dataUrl = await toDataUrl(blob);
    setImg(dataUrl);
    const m = await api<View>("/api/intake", { dataUrl });
    localStorage.setItem(KEY, m.id); setV(m); setDraft({}); setLogs([]);
  });
  const answer = () => guard("Saving your answers…", async () => { setV(await api<View>(`/api/intake/${v!.id}`, { action: "answer", answers: draft })); });
  const runStage = (stage: "register" | "plan") => guard(stage === "register" ? "AI colleagues are building the register…" : "AI colleagues are writing the remedial plan…", async () => {
    const fresh = await api<View>(`/api/intake/${v!.id}`);
    const input = stage === "register" ? fresh.registerInput : fresh.planInput;
    if (!input) throw new Error(stage === "register" ? "Confirm the uncertain entries first" : "Verify the register first");
    setLogs([]);
    try { await simulation.startLive(input, (agent, text) => setLogs((l) => [...l.slice(-60), { agent, text }]), { url: `/api/intake/${v!.id}`, body: { action: "run", stage } }); }
    finally { await refresh(); }
  });
  const approve = () => guard("Approving…", async () => {
    setV(await api<View>(`/api/intake/${v!.id}`, { action: "approve" }));
    staffroom.dispatch({ id: `teacher-${Date.now()}`, agentId: "teacher", action: "approve_field", targetId: "document", status: "completed", at: Date.now(), payload: { status: "approved" }, summary: "Teacher approved the register and remedial plan" });
  });
  const startOver = () => { localStorage.removeItem(KEY); setV(null); setImg(""); setLogs([]); setDraft({}); setErr(""); simulation.reset(); };

  const btn = "flex w-full items-center justify-center gap-2 rounded-md bg-sidebar-primary px-3 py-2 text-sm font-semibold text-sidebar-primary-foreground hover:brightness-110 disabled:opacity-50";
  const ghost = "flex w-full items-center justify-center gap-2 rounded-md border border-sidebar-border px-3 py-2 text-xs font-semibold hover:bg-sidebar-accent disabled:opacity-50";
  const openQs = v ? v.questions.filter((q) => v.open.includes(q.id)) : [];
  const cellBoxes = v ? v.extraction.rows.flatMap((r) => r.marks.map((c) => c.box).concat(r.recorded.box)).filter((b): b is Box => Array.isArray(b) && b.length === 4) : [];

  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-md border border-writer/40 bg-writer/10 p-2 text-[11px]"><b>Live mode only.</b> A real AI reads your photo; nothing here is pre-filled. Unclear marks are never guessed — you confirm them.</div>
      {!v && (
        <>
          <label className={`${btn} cursor-pointer`}><Camera className="h-4 w-4" />Snap or upload a marksheet
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
          </label>
          <button type="button" className={ghost} disabled={!!busy} onClick={() => void guard("Loading sample…", async () => { await upload(await (await fetch(sampleUrl)).blob()); })}><Upload className="h-3.5 w-3.5" />Try a sample handwritten sheet</button>
        </>
      )}
      {img && <Photo src={img} boxes={cellBoxes} focus={focus} />}
      {v && (
        <>
          <div className="flex items-center justify-between"><span className="rounded-full bg-sidebar-accent px-2 py-0.5 font-semibold">{STAGE_LABEL[v.stage]}</span>
            <button type="button" onClick={startOver} className="inline-flex items-center gap-1 text-sidebar-foreground/60 hover:text-sidebar-foreground"><RotateCcw className="h-3 w-3" />New photo</button></div>
          <div className="rounded-md border border-sidebar-border p-2">
            <div className="mb-1 font-semibold">Read from your photo{v.extraction.title ? `: ${v.extraction.title}` : ""}</div>
            <table className="w-full font-mono text-[10px]"><tbody>
              <tr className="text-sidebar-foreground/60"><td>Max</td>{v.extraction.maxes.map((m, q) => <td key={q}>{m ?? "?"}</td>)}<td>Tot</td></tr>
              {v.extraction.rows.map((r, i) => (
                <tr key={i}><td className="truncate pr-1">{r.name}</td>
                  {r.marks.map((c, q) => { const ans = v.answers[`m-${i}-${q}`]; const asked = `m-${i}-${q}` in v.answers || v.open.includes(`m-${i}-${q}`);
                    return <td key={q} onMouseEnter={() => setFocus(c.box ?? null)} onMouseLeave={() => setFocus(null)} className={asked ? (ans !== undefined ? "font-bold text-writer" : "bg-corrector/30 font-bold") : ""}>{asked ? (ans !== undefined ? (ans ?? "–") : "?") : c.state === "blank" ? "–" : c.value}</td>; })}
                  <td>{r.recorded.state === "blank" ? "–" : `t-${i}` in v.answers ? v.answers[`t-${i}`] ?? "–" : v.open.includes(`t-${i}`) ? "?" : r.recorded.value}</td></tr>
              ))}
            </tbody></table>
            <div className="mt-1 text-[10px] text-sidebar-foreground/50">Hover a mark to see where it is on the photo. Green = you confirmed it. – = blank on paper.</div>
          </div>
          {v.stage === "WAITING_FOR_TEACHER" && (
            <div className="space-y-2 rounded-md border border-corrector bg-corrector/10 p-2">
              <div className="font-semibold">The agents need you to confirm {openQs.length} entr{openQs.length === 1 ? "y" : "ies"}</div>
              {openQs.map((q) => (
                <div key={q.id} className="space-y-1" onMouseEnter={() => setFocus(q.box ?? null)} onMouseLeave={() => setFocus(null)}>
                  <div>{q.prompt}</div>
                  <div className="flex flex-wrap gap-1">
                    {q.options.map((o) => <button type="button" key={o} onClick={() => setDraft((d) => ({ ...d, [q.id]: o }))} className={`rounded border px-2 py-0.5 ${draft[q.id] === o ? "border-writer bg-writer/20 font-bold" : "border-sidebar-border"}`}>{o}</button>)}
                    <input type="number" min={0} placeholder="Other" aria-label={`Other value for ${q.prompt}`} className="w-16 rounded border border-sidebar-border bg-sidebar-accent px-1" onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value === "" ? (undefined as never) : Number(e.target.value) }))} />
                    {q.col !== "max" && <button type="button" onClick={() => setDraft((d) => ({ ...d, [q.id]: null }))} className={`rounded border px-2 py-0.5 ${q.id in draft && draft[q.id] === null ? "border-writer bg-writer/20 font-bold" : "border-sidebar-border"}`}>Mark is missing</button>}
                  </div>
                </div>
              ))}
              <button type="button" className={btn} disabled={!!busy || openQs.some((q) => draft[q.id] === undefined)} onClick={() => void answer()}><CheckCheck className="h-4 w-4" />Confirm and continue</button>
            </div>
          )}
          {v.stage === "READY_FOR_REGISTER" && <button type="button" className={btn} disabled={!!busy} onClick={() => void runStage("register")}><FileText className="h-4 w-4" />Build the register with AI colleagues</button>}
          {(v.stage === "REGISTER_RUNNING" || v.stage === "PLAN_RUNNING") && !busy && <button type="button" className={ghost} onClick={() => void refresh()}>Agents were still working — check again</button>}
          {v.register && (
            <div className="rounded-md border border-sidebar-border p-2">
              <b>Register review:</b> {v.register.rounds ?? 1} review round(s), {v.register.issues ?? 0} issue(s) raised, {v.register.openIssues?.length ?? 0} still open. Verifier: {v.register.consistent ? "consistent" : "needs your review"}.
              {v.confirmed && <div className="mt-1">Mismatched totals are shown as <i>proposals</i> on the register — your recorded marks are unchanged.</div>}
            </div>
          )}
          {(v.stage === "REGISTER_VERIFIED" || v.stage === "PLAN_READY") && !docDone && !busy && <div className="text-sidebar-foreground/70">Watch the colleagues build it on the page…</div>}
          {v.stage === "REGISTER_VERIFIED" && <button type="button" className={btn} disabled={!!busy || !docDone} onClick={() => void runStage("plan")}><FileText className="h-4 w-4" />Create remedial lesson plan from these results</button>}
          {v.planInput && (v.stage === "REGISTER_VERIFIED" || v.plan) && <div className="text-[10px] text-sidebar-foreground/60">Plan focus (from your confirmed scores): {v.planInput.topic.replace(/^Remediation: /, "")}</div>}
          {v.stage === "PLAN_READY" && <button type="button" className={btn} disabled={!!busy || !docDone} onClick={() => void approve()}><CheckCheck className="h-4 w-4" />Approve register & plan</button>}
          {v.register && v.registerInput && <button type="button" className={ghost} disabled={!!busy} onClick={() => simulation.start(v.registerInput!, v.register)}>Show the register again</button>}
          {v.confirmed && v.register && <button type="button" className={ghost} onClick={() => download("assessment-register.csv", registerCsv(v), "text/csv")}><Download className="h-3.5 w-3.5" />Download register (CSV){v.stage === "APPROVED" ? "" : " — draft"}</button>}
          {v.plan && <button type="button" className={ghost} onClick={() => download("remedial-lesson-plan.md", planText(v), "text/markdown")}><Download className="h-3.5 w-3.5" />Download remedial plan{v.stage === "APPROVED" ? "" : " — draft"}</button>}
        </>
      )}
      {busy && <div className="flex items-center gap-2 text-sidebar-foreground/80"><Loader2 className="h-3.5 w-3.5 animate-spin" />{busy}</div>}
      {err && <p className="text-destructive">{err}</p>}
      {v?.error && !err && <p className="text-destructive">Last run: {v.error}</p>}
      {logs.length > 0 && (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-sidebar-border p-2 font-mono text-[10px] leading-snug">
          {logs.map((l, k) => <div key={k}><span className="font-bold capitalize" style={{ color: `var(--${l.agent})` }}>{l.agent}</span> {l.text}</div>)}
        </div>
      )}
    </div>
  );
}
