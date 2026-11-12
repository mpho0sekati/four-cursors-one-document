import { useState } from "react";
import { Play, Sparkles } from "lucide-react";
import { EXAMPLES } from "@/staffroom/missions";
import { simulation } from "@/staffroom/SimulationController";
import type { MissionInput, MissionType } from "@/staffroom/types";

const TYPES: { id: MissionType; label: string }[] = [
  { id: "lesson", label: "Lesson Plan" },
  { id: "report", label: "Learner Progress Report" },
  { id: "register", label: "Assessment Register" },
];
const LEARNER_HINT: Record<MissionType, string> = {
  lesson: "One name per line",
  report: "Name | percentage",
  register: "First line: Max | 5,5,10 — then Name | marks | recorded total. Leave a mark blank if missing.",
};

const inputCls = "w-full rounded-md border border-sidebar-border bg-sidebar-accent px-2.5 py-1.5 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:outline-none focus:ring-2 focus:ring-sidebar-ring";

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">{label}</span>
      {children}
    </label>
  );
}

export function MissionDesk() {
  const [m, setM] = useState<MissionInput>(EXAMPLES.lesson);
  const set = <K extends keyof MissionInput>(k: K, v: MissionInput[K]) => setM((x) => ({ ...x, [k]: v }));

  return (
    <aside className="no-print flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-5 py-4">
        <div className="font-display text-lg font-extrabold tracking-tight">AI Staffroom</div>
        <div className="text-xs text-sidebar-foreground/60">Mission Desk</div>
      </div>
      <form
        className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
        onSubmit={(e) => { e.preventDefault(); simulation.start(m); }}
      >
        <L label="Document type">
          <select className={inputCls} value={m.type} onChange={(e) => setM(EXAMPLES[e.target.value as MissionType])}>
            {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </L>
        <button type="button" onClick={() => setM(EXAMPLES[m.type])} className="flex items-center gap-1.5 text-xs font-medium text-sidebar-primary-foreground/80 hover:text-sidebar-primary-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Load example mission
        </button>
        <div className="grid grid-cols-2 gap-3">
          <L label="Teacher"><input className={inputCls} value={m.teacher} onChange={(e) => set("teacher", e.target.value)} /></L>
          <L label="Grade"><input className={inputCls} value={m.grade} onChange={(e) => set("grade", e.target.value)} /></L>
        </div>
        <L label="School"><input className={inputCls} value={m.school} onChange={(e) => set("school", e.target.value)} /></L>
        <div className="grid grid-cols-2 gap-3">
          <L label="Subject"><input className={inputCls} value={m.subject} onChange={(e) => set("subject", e.target.value)} /></L>
          <L label="Duration (min)"><input type="number" min={10} className={inputCls} value={m.duration} onChange={(e) => set("duration", Number(e.target.value) || 0)} /></L>
        </div>
        <L label="Topic"><input className={inputCls} value={m.topic} onChange={(e) => set("topic", e.target.value)} /></L>
        <L label="Learners">
          <textarea rows={6} className={`${inputCls} font-mono text-xs`} value={m.learners} onChange={(e) => set("learners", e.target.value)} />
          <span className="block text-[10px] text-sidebar-foreground/50">{LEARNER_HINT[m.type]}</span>
        </L>
        <L label="Additional instructions"><textarea rows={3} className={inputCls} value={m.instructions} onChange={(e) => set("instructions", e.target.value)} /></L>
        <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-md bg-sidebar-primary px-4 py-2.5 text-sm font-semibold text-sidebar-primary-foreground shadow-lg transition hover:brightness-110">
          <Play className="h-4 w-4" /> Start mission
        </button>
      </form>
      <p className="border-t border-sidebar-border px-5 py-3 text-[10px] leading-snug text-sidebar-foreground/50">
        Frontend demonstration. Agents are simulated; all checks are deterministic code running in your browser. No data leaves this page.
      </p>
    </aside>
  );
}
