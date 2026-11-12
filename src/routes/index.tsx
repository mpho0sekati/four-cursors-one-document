import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { setSoundEnabled } from "@/staffroom/sound";
import { CheckCheck, Download, Printer } from "lucide-react";
import { AgentActivityPanel } from "@/components/staffroom/AgentActivityPanel";
import { CursorLayer } from "@/components/staffroom/CursorLayer";
import { DocumentCanvas } from "@/components/staffroom/DocumentCanvas";
import { MissionDesk } from "@/components/staffroom/MissionDesk";
import { staffroom, useStaffroom } from "@/staffroom/DocumentStore";
import { EXAMPLES, registerCsv } from "@/staffroom/missions";
import { simulation } from "@/staffroom/SimulationController";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Staffroom — Watch AI colleagues build your school documents" },
      { name: "description", content: "Four animated AI colleagues plan, write, review and correct lesson plans, progress reports and assessment registers in front of you." },
      { property: "og:title", content: "AI Staffroom" },
      { property: "og:description", content: "Watch four AI colleagues collaborate live on lesson plans, reports and marksheets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Toolbar() {
  const status = useStaffroom((s) => s.status);
  const complete = useStaffroom((s) => s.control.complete);
  const type = useStaffroom((s) => s.input?.type);
  const hasMissing = useStaffroom((s) => Object.values(s.fields).some((f) => f.rows.some((r) => r.status === "missing")));
  const proposed = useStaffroom((s) => Object.values(s.fields).reduce((a, f) => a + f.rows.filter((r) => r.status === "proposed").length, 0));

  const approve = () =>
    staffroom.dispatch({
      id: `teacher-${Date.now()}`, agentId: "teacher", action: "approve_field", targetId: "document", status: "completed", at: Date.now(),
      payload: { status: hasMissing ? "provisional" : "approved" },
      summary: proposed ? `Approved ${proposed} proposed total(s)` : hasMissing ? "Approved — stays provisional until marks supplied" : "Approved document",
    });
  const csv = () => {
    const blob = new Blob([registerCsv(staffroom.get())], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `assessment-register-${status}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const [sound, setSound] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("staffroom-sound") === "on") setSound(true);
  }, []);
  useEffect(() => { setSoundEnabled(sound); }, [sound]);
  const toggleSound = () => setSound((v) => { localStorage.setItem("staffroom-sound", v ? "off" : "on"); return !v; });
  const btn = "inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-40";
  return (
    <div className="no-print flex items-center gap-2 border-b bg-background/80 px-6 py-2.5 backdrop-blur">
      <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">Frontend demonstration · simulated agents</span>
      <div className="ml-auto flex gap-2">
        <button onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Mute sound" : "Turn sound on"} className={btn}>
          <span aria-hidden>{sound ? "🔊" : "🔇"}</span>Sound
        </button>
        {complete && status !== "approved" && (
          <button onClick={approve} className="inline-flex items-center gap-1.5 rounded-md bg-writer px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110">
            <CheckCheck className="h-3.5 w-3.5" />{proposed ? `Approve ${proposed} correction${proposed > 1 ? "s" : ""}` : "Teacher approval"}
          </button>
        )}
        {type === "register" && <button disabled={!complete} onClick={csv} className={btn}><Download className="h-3.5 w-3.5" />CSV</button>}
        <button disabled={!complete} onClick={() => window.print()} className={btn}><Printer className="h-3.5 w-3.5" />Print / PDF</button>
      </div>
    </div>
  );
}

function Index() {
  const wrap = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => { if (!staffroom.get().input) simulation.start(EXAMPLES.lesson); }, 600);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (localStorage.getItem("staffroom-panel") === "closed") setPanelOpen(false);
  }, []);
  const togglePanel = () =>
    setPanelOpen((v) => {
      localStorage.setItem("staffroom-panel", v ? "closed" : "open");
      return !v;
    });
  return (
    <div className="print-root grid h-screen grid-cols-[300px_1fr_auto] overflow-hidden bg-background font-sans">
      <MissionDesk />
      <main className="print-root flex min-w-0 flex-col overflow-hidden">
        <Toolbar />
        <div className="print-root flex-1 overflow-auto">
          <div ref={wrap} className="relative px-24 py-10 print:p-0">
            <DocumentCanvas />
            <CursorLayer containerRef={wrap} />
          </div>
        </div>
      </main>
      <AgentActivityPanel open={panelOpen} onToggle={togglePanel} />
    </div>
  );
}
