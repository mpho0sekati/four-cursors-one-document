import type { AgentId } from "./types";

export const AGENT_IDS: AgentId[] = ["planner", "writer", "reviewer", "corrector", "verifier"];

// Literal class names so Tailwind keeps them.
export const AGENTS: Record<AgentId, { name: string; role: string; bg: string; text: string; ring: string; fill: string; soft: string }> = {
  planner: { name: "Planner", role: "Builds structure & task list", bg: "bg-planner", text: "text-planner", ring: "ring-planner", fill: "fill-planner", soft: "bg-planner/10" },
  writer: { name: "Writer", role: "Fills fields & tables", bg: "bg-writer", text: "text-writer", ring: "ring-writer", fill: "fill-writer", soft: "bg-writer/10" },
  reviewer: { name: "Reviewer", role: "Checks for gaps & errors", bg: "bg-reviewer", text: "text-reviewer", ring: "ring-reviewer", fill: "fill-reviewer", soft: "bg-reviewer/10" },
  corrector: { name: "Corrector", role: "Applies justified fixes", bg: "bg-corrector", text: "text-corrector", ring: "ring-corrector", fill: "fill-corrector", soft: "bg-corrector/10" },
  verifier: { name: "Verifier", role: "Final check: document matches the mission", bg: "bg-verifier", text: "text-verifier", ring: "ring-verifier", fill: "fill-verifier", soft: "bg-verifier/10" },
};
