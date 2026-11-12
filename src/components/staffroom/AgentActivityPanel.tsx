import { Pause, Play, RotateCcw } from "lucide-react";
import { useStaffroom } from "@/staffroom/DocumentStore";
import { AGENTS, AGENT_IDS } from "@/staffroom/agents";
import { simulation } from "@/staffroom/SimulationController";
import { cn } from "@/lib/utils";

const STATUS: Record<string, string> = { idle: "Idle", moving: "Moving", working: "Working", waiting: "Waiting", done: "Done" };

export function AgentActivityPanel() {
  const agents = useStaffroom((s) => s.agents);
  const c = useStaffroom((s) => s.control);
  const log = useStaffroom((s) => s.log);
  const started = useStaffroom((s) => s.input !== null);
  const entries = log.filter((e) => e.status === "completed" && e.summary).slice(-40).reverse();
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;

  return (
    <aside className="no-print flex h-full flex-col border-l bg-card">
      <div className="border-b px-4 py-4">
        <div className="font-display text-sm font-bold uppercase tracking-[0.14em]">Agent Control</div>
        <div className="mt-3 flex items-center gap-2">
          <button disabled={!c.running} onClick={() => (c.paused ? simulation.resume() : simulation.pause())} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-40">
            {c.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{c.paused ? "Resume" : "Pause"}
          </button>
          <button disabled={!started} onClick={() => simulation.restart()} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-40">
            <RotateCcw className="h-3.5 w-3.5" />Replay
          </button>
          <div className="ml-auto flex overflow-hidden rounded-md border">
            {([1, 2, 3] as const).map((s) => (
              <button key={s} onClick={() => simulation.setSpeed(s)} className={cn("px-2 py-1.5 text-xs font-semibold", c.speed === s ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{s}x</button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-muted-foreground"><span>{c.complete ? "Mission complete" : c.paused ? "Paused" : c.running ? "In progress" : "Ready"}</span><span>{c.done}/{c.total} tasks</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
      <div className="space-y-2 border-b p-3">
        {AGENT_IDS.map((id) => {
          const a = agents[id], d = AGENTS[id];
          return (
            <div key={id} className="rounded-lg border p-2.5">
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", d.bg, (a.status === "working" || a.status === "moving") && "animate-pulse")} />
                <span className={cn("text-sm font-bold", d.text)}>{d.name}</span>
                <span className="text-[11px] text-muted-foreground">{d.role}</span>
                <span className="ml-auto text-[10px] font-semibold uppercase text-muted-foreground">{STATUS[a.status]}</span>
              </div>
              <div className="mt-1 truncate text-xs">{a.status === "waiting" ? a.bubble : a.currentTask}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{a.completed} actions completed{a.actions[0] ? ` · last: ${a.actions[0]}` : ""}</div>
            </div>
          );
        })}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Event log</div>
        <ol className="flex-1 space-y-1 overflow-y-auto px-4 pb-4 font-mono text-[11px]">
          {entries.map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="text-muted-foreground">{e.id.slice(6)}</span>
              <span className={cn("font-semibold", e.agentId === "teacher" ? "text-foreground" : AGENTS[e.agentId].text)}>{e.agentId === "teacher" ? "Teacher" : AGENTS[e.agentId].name}</span>
              <span className="min-w-0 flex-1 break-words">{e.action === "flag_issue" ? "⚠ " : ""}{e.summary}</span>
            </li>
          ))}
          {entries.length === 0 && <li className="text-muted-foreground">No events yet.</li>}
        </ol>
      </div>
    </aside>
  );
}
