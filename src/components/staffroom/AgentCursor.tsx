import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, type RefObject } from "react";
import { AGENTS, AGENT_IDS } from "@/staffroom/agents";
import type { AgentState } from "@/staffroom/types";

const OFFSETS = [0.06, 0.32, 0.62, 0.86];

function computeTarget(a: AgentState, c: HTMLElement, regroup: boolean, index: number) {
  const cr = c.getBoundingClientRect();
  // Home / regroup spot: the left margin beside the paper.
  const home = { x: 10 + (regroup ? (index % 2) * 8 : 0), y: (regroup ? 140 : 110) + index * 44 };
  if (regroup || !a.target) return home;
  if (a.typing) {
    const caret = c.querySelector(`[data-caret="${a.id}"]`);
    if (caret) { const r = caret.getBoundingClientRect(); return { x: r.right - cr.left + 1, y: r.bottom - cr.top - 6 }; }
  }
  const fieldId = a.target.split("::")[0];
  const el = c.querySelector(`[data-field-id="${CSS.escape(a.target)}"]`) ?? c.querySelector(`[data-field-id="${CSS.escape(fieldId ?? "")}"]`);
  if (!el) return home;
  const r = el.getBoundingClientRect();
  return { x: r.left - cr.left + Math.min(r.width - 20, r.width * (OFFSETS[index] ?? 0.5)), y: r.top - cr.top + Math.min(r.height - 6, 16) };
}

export function AgentCursor({ agent, containerRef, regroup }: { agent: AgentState; containerRef: RefObject<HTMLDivElement | null>; regroup: boolean }) {
  const reduce = useReducedMotion();
  const index = AGENT_IDS.indexOf(agent.id);
  const def = AGENTS[agent.id];
  const x = useMotionValue(10);
  const y = useMotionValue(110 + index * 44);
  const sx = useSpring(x, { stiffness: 90, damping: 18, mass: 0.9 });
  const sy = useSpring(y, { stiffness: 90, damping: 18, mass: 0.9 });
  const live = useRef({ agent, regroup });
  live.current = { agent, regroup };

  // Re-measure real DOM targets every frame: follows scroll, resize and layout shifts.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const c = containerRef.current;
      if (c) { const p = computeTarget(live.current.agent, c, live.current.regroup, index); x.set(p.x); y.set(p.y); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [containerRef, index, x, y]);

  const idle = agent.status === "waiting" || agent.status === "idle" || agent.status === "done";
  return (
    <motion.div className="pointer-events-none absolute left-0 top-0 z-30" style={{ x: reduce ? x : sx, y: reduce ? y : sy }}>
      <motion.div animate={idle && !reduce ? { y: [0, -3, 0], rotate: [0, -3, 0] } : { y: 0, rotate: 0 }} transition={idle ? { duration: 2.4 + index * 0.3, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}>
        <AnimatePresence>
          {agent.clicks > 0 && (
            <motion.span key={agent.clicks} className={`absolute -left-2 -top-2 h-5 w-5 rounded-full ${def.bg}`} initial={{ scale: 0.2, opacity: 0.55 }} animate={{ scale: 2.2, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.55 }} />
          )}
        </AnimatePresence>
        <svg width="20" height="24" viewBox="0 0 20 24" className="relative drop-shadow-md">
          <path d="M2 2 L2 19.5 L6.6 15.4 L9.7 22.3 L12.8 20.9 L9.8 14.2 L16.2 14 Z" className={`${def.fill} stroke-background`} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
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
            {agent.bubble && (
              <motion.div key={agent.bubble} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-48 truncate rounded-md border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                {agent.bubble}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
