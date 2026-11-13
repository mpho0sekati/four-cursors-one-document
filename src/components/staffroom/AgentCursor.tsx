import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform, useVelocity } from "motion/react";
import { BoxSelect, ScanSearch, TextCursorInput, Wand2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import { AGENTS, AGENT_IDS } from "@/staffroom/agents";
import type { AgentId, AgentState } from "@/staffroom/types";

const OFFSETS = [0.06, 0.28, 0.5, 0.72, 0.92];
const TOOL: Record<AgentId, typeof BoxSelect> = { planner: BoxSelect, writer: TextCursorInput, reviewer: ScanSearch, corrector: Wand2, verifier: ShieldCheck };
const TOOL_ACTIVE: Record<AgentId, string[]> = {
  planner: ["create_section", "populate_table", "generate_document"],
  writer: ["type_text", "populate_table"],
  reviewer: ["validate_field", "flag_issue", "approve_field"],
  corrector: ["correct_field"],
  verifier: ["validate_field", "flag_issue", "approve_field"],
};

function computeTarget(a: AgentState, c: HTMLElement, regroup: number | null, index: number, reduce: boolean) {
  const cr = c.getBoundingClientRect();
  if (regroup !== null) {
    const seal = c.querySelector('[data-field-id="doc-seal"]');
    if (seal) {
      const r = seal.getBoundingClientRect();
      const cx = r.left - cr.left + r.width / 2, cy = r.top - cr.top + r.height / 2;
      const t = (performance.now() - regroup) / 1000;
      // Flock in a widening orbit for a few seconds, then settle into a ring.
      const spin = reduce ? 0 : Math.max(0, 1 - t / 5);
      const ang = index * (Math.PI / 2) + (reduce ? 0 : t * 2.4 * spin + (1 - spin) * 12) - Math.PI / 2;
      const rad = 58 + (reduce ? 0 : Math.sin(t * 3 + index) * 10 * spin);
      return { x: cx + Math.cos(ang) * rad * 1.5, y: cy + Math.sin(ang) * rad };
    }
  }
  const home = { x: 10, y: 110 + index * 44 };
  if (!a.target) return home;
  if (a.typing) {
    const caret = c.querySelector(`[data-caret="${a.id}"]`);
    if (caret) { const r = caret.getBoundingClientRect(); return { x: r.right - cr.left + 1, y: r.bottom - cr.top - 6 }; }
  }
  const fieldId = a.target.split("::")[0];
  const el = c.querySelector(`[data-field-id="${CSS.escape(a.target)}"]`) ?? c.querySelector(`[data-field-id="${CSS.escape(fieldId ?? "")}"]`);
  if (!el) return home;
  const r = el.getBoundingClientRect();
  // Planner drags the blueprint's bottom-right corner.
  if (a.target === "__blueprint") return { x: r.right - cr.left, y: r.bottom - cr.top };
  return { x: r.left - cr.left + Math.min(r.width - 20, r.width * (OFFSETS[index] ?? 0.5)), y: r.top - cr.top + Math.min(r.height - 6, 16) };
}

function Pointer({ id, ibeam }: { id: AgentId; ibeam: boolean }) {
  const def = AGENTS[id];
  if (ibeam) {
    return (
      <svg width="20" height="24" viewBox="0 0 20 24" className="relative -translate-x-[9px] drop-shadow-md">
        <path d="M6 2h8M10 2v20M6 22h8" className={`${def.text} stroke-current`} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </svg>
    );
  }
  return (
    <svg width="20" height="24" viewBox="0 0 20 24" className="relative drop-shadow-md">
      <path d="M2 2 L2 19.5 L6.6 15.4 L9.7 22.3 L12.8 20.9 L9.8 14.2 L16.2 14 Z" className={`${def.fill} stroke-background`} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function AgentCursor({ agent, containerRef, regroup }: { agent: AgentState; containerRef: RefObject<HTMLDivElement | null>; regroup: boolean }) {
  const reduce = !!useReducedMotion();
  const index = AGENT_IDS.indexOf(agent.id);
  const def = AGENTS[agent.id];
  const x = useMotionValue(10);
  const y = useMotionValue(110 + index * 44);
  const sx = useSpring(x, { stiffness: 110, damping: 17, mass: 0.85 });
  const sy = useSpring(y, { stiffness: 110, damping: 17, mass: 0.85 });
  // Lean into the direction of travel: horizontal velocity → tilt.
  const vx = useVelocity(sx);
  const tilt = useSpring(useTransform(vx, [-1400, 0, 1400], [-22, 0, 22], { clamp: true }), { stiffness: 300, damping: 25 });
  const live = useRef<{ agent: AgentState; regroupAt: number | null }>({ agent, regroupAt: null });
  live.current.agent = agent;
  if (regroup && live.current.regroupAt === null) live.current.regroupAt = performance.now();
  if (!regroup) live.current.regroupAt = null;

  // Re-measure real DOM targets every frame: follows scroll, resize and layout shifts.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const c = containerRef.current;
      if (c) { const p = computeTarget(live.current.agent, c, live.current.regroupAt, index, reduce); x.set(p.x); y.set(p.y); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [containerRef, index, x, y, reduce]);

  const idle = agent.status === "waiting" || agent.status === "idle";
  const toolOn = !!agent.action && TOOL_ACTIVE[agent.id].includes(agent.action);
  const Tool = TOOL[agent.id];
  const ibeam = agent.id === "writer" && agent.typing;
  const scanning = agent.id === "reviewer" && agent.action === "validate_field";

  return (
    <motion.div className="pointer-events-none absolute left-0 top-0 z-30" style={{ x: reduce ? x : sx, y: reduce ? y : sy }}>
      {/* Alignment guides flash on every click. */}
      <AnimatePresence>
        {agent.clicks > 0 && !reduce && (
          <motion.div key={`g${agent.clicks}`} initial={{ opacity: 0.55 }} animate={{ opacity: 0 }} transition={{ duration: 0.9, ease: "easeOut" }} className="absolute inset-0">
            <span className={`absolute -left-[2000px] top-0 h-px w-[4000px] ${def.bg} opacity-60`} />
            <span className={`absolute -top-[2000px] left-0 h-[4000px] w-px ${def.bg} opacity-60`} />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div style={{ rotate: reduce ? 0 : tilt, transformOrigin: "2px 2px" }}>
        <motion.div animate={idle && !reduce ? { y: [0, -3, 0] } : { y: 0 }} transition={idle ? { duration: 2.4 + index * 0.3, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}>
          <AnimatePresence>
            {agent.clicks > 0 && (
              <motion.span key={agent.clicks} className={`absolute -left-2 -top-2 h-5 w-5 rounded-full ${def.bg}`} initial={{ scale: 0.2, opacity: 0.55 }} animate={{ scale: 2.2, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.55 }} />
            )}
          </AnimatePresence>
          {scanning && (
            <motion.span className="absolute -left-[22px] -top-[22px] h-12 w-12 rounded-full border-2 border-dashed border-reviewer" animate={reduce ? {} : { rotate: 360, scale: [1, 1.12, 1] }} transition={{ rotate: { duration: 2.2, repeat: Infinity, ease: "linear" }, scale: { duration: 1.1, repeat: Infinity } }}>
              <span className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-reviewer" />
              <span className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-reviewer" />
              <span className="absolute left-0 top-1/2 h-px w-2 -translate-y-1/2 bg-reviewer" />
              <span className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 bg-reviewer" />
            </motion.span>
          )}
          {agent.id === "corrector" && agent.action === "correct_field" && !reduce && (
            <motion.span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-corrector" animate={{ scale: [0, 1.6, 0], x: [0, -10, 6], y: [0, -12, -4], opacity: [1, 0.8, 0] }} transition={{ duration: 0.9, repeat: Infinity }} />
          )}
          <Pointer id={agent.id} ibeam={ibeam} />
          <AnimatePresence>
            {toolOn && (
              <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className={`absolute -top-3 left-3 grid h-5 w-5 place-items-center rounded-md border-2 border-background ${def.bg} text-primary-foreground shadow`}>
                <Tool className="h-3 w-3" strokeWidth={2.6} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
      <div className="absolute left-4 top-5 flex flex-col items-start gap-1">
        <div className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-sm ${def.bg}`}>
          {def.name}
          {agent.typing && (
            <span className="flex gap-0.5">
              {[0, 1, 2].map((d) => (
                <motion.span key={d} className="h-1 w-1 rounded-full bg-primary-foreground" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }} />
              ))}
            </span>
          )}
        </div>
        <AnimatePresence mode="wait">
          {agent.bubble && !regroup && (
            <motion.div key={agent.bubble} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-48 truncate rounded-md border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
              {agent.bubble}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
