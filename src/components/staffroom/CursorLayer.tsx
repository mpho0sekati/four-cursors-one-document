import type { RefObject } from "react";
import { useStaffroom } from "@/staffroom/DocumentStore";
import { AGENT_IDS } from "@/staffroom/agents";
import { AgentCursor } from "./AgentCursor";

export function CursorLayer({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const agents = useStaffroom((s) => s.agents);
  const regroup = useStaffroom((s) => s.control.regroup);
  const started = useStaffroom((s) => s.input !== null);
  if (!started) return null;
  return (
    <div className="no-print pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {AGENT_IDS.map((id) => <AgentCursor key={id} agent={agents[id]} containerRef={containerRef} regroup={regroup} />)}
    </div>
  );
}
