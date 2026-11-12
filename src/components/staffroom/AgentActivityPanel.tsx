import { Eraser, Pause, PanelLeftClose, PanelLeftOpen, Play, RotateCcw } from "lucide-react";
import { useStaffroom } from "@/staffroom/DocumentStore";
import { AGENTS, AGENT_IDS } from "@/staffroom/agents";
import { simulation } from "@/staffroom/SimulationController";
import { cn } from "@/lib/utils";

const STATUS: Record<string, string> = { idle: "Idle", moving: "Moving", working: "Working", waiting: "Waiting", done: "Done" };

type Props = { open: boolean; onToggle: () => void };

export function AgentActivityPanel({ open, onToggle }: Props) {
  const agents = useStaffroom((s) => s.agents);
  const c = useStaffroom((s) => s.control);
  const log = useStaffroom((s) => s.log);
  const started = useStaffroom((s) => s.input !== null);
  const canReplay = started || simulation.lastInput !== null;
  const entries = log.filter((e) => e.status === "completed" && e.summary).slice(-40).reverse();
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;

  const toggle = (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? "Collapse Agent Control" : "Expand Agent Control"}
      title={open ? "Hide Agent Control — the document gets the full window" : "Show Agent Control"}
      className="rounded-md border p-1.5 hover:bg-accent"
    >
      {open ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
    </button>
  );

  return (
    <aside
      className={cn(
        "no-print flex h-full shrink-0 flex-col overflow-hidden border-l bg-card transition-[width] duration-300 ease-out",
        open ? "w-[340px]" : "w-11",
      )}
    >
      {open ? (
        <div className="flex h-full w-[340px] flex-col">
          <div className="border-b px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="font-display text-sm font-bold uppercase tracking-[0.14em]">Agent Control</div>
              {toggle}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button disabled={!c.running} onClick={() => (c.paused ? simulation.resume() : simulation.pause())} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-40">
                {c.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{c.paused ? "Resume" : "Pause"}
              </button>
              <button disabled={!canReplay} onClick={() => simulation.restart()} title="Run this mission again from the beginning" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-40">
                <RotateCcw className="h-3.5 w-3.5" />Replay
              </button>
              <button disabled={!started} onClick={() => simulation.reset()} title="Stop and clear the document" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-40">
                <Eraser className="h-3.5 w-3.5" />Reset
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
        </div>
      ) : (
        <div className="flex h-full w-11 flex-col items-center gap-3 py-3">
          {toggle}
          <button
            disabled={!c.running}
            onClick={() => (c.paused ? simulation.resume() : simulation.pause())}
            aria-label={c.paused ? "Resume mission" : "Pause mission"}
            title={c.paused ? "Resume mission" : "Pause mission"}
            className="rounded-md border p-1.5 hover:bg-accent disabled:opacity-40"
          >
            {c.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
          <div className="flex flex-col items-center gap-1.5">
            {AGENT_IDS.map((id) => {
              const a = agents[id], d = AGENTS[id];
              return (
                <span
                  key={id}
                  title={`${d.name} — ${STATUS[a.status] ?? a.status}`}
                  className={cn("h-2.5 w-2.5 rounded-full", d.bg, (a.status === "working" || a.status === "moving") && "animate-pulse")}
                />
              );
            })}
          </div>
          <div
            className="relative w-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Mission progress"
          >
            <div className="absolute bottom-0 left-0 w-full bg-primary transition-all duration-500" style={{ height: `${pct}%` }} />
          </div>
          <span className="select-none text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground [writing-mode:vertical-rl]">
            Agent Control
          </span>
        </div>
      )}
    </aside>
  );
}
