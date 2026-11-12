import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type RefObject } from "react";
import { useStaffroom } from "@/staffroom/DocumentStore";

const HEIGHT = { text: 130, table: 190, kv: 120 } as const;

/** Wireframe drag-box the Planner draws before a real section appears. */
export function Blueprint({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const bp = useStaffroom((s) => s.blueprint);
  const [slot, setSlot] = useState<{ x: number; y: number; w: number } | null>(null);

  useEffect(() => {
    if (!bp) return;
    const c = containerRef.current;
    const end = c?.querySelector("[data-doc-end]");
    if (!c || !end) return;
    const cr = c.getBoundingClientRect();
    const r = end.getBoundingClientRect();
    setSlot({ x: r.left - cr.left, y: r.top - cr.top + 16, w: r.width });
  }, [bp, containerRef]);

  const h = bp ? HEIGHT[bp.kind] : 0;
  return (
    <AnimatePresence>
      {bp && slot && (
        <motion.div
          key={bp.label}
          data-field-id="__blueprint"
          className="absolute rounded-lg border-2 border-dashed border-planner bg-card"
          style={{ left: slot.x, top: slot.y }}
          initial={{ width: 8, height: 8, opacity: 0 }}
          animate={{ width: slot.w, height: h, opacity: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ width: { delay: 0.55, duration: 0.7, ease: [0.3, 0.7, 0.2, 1] }, height: { delay: 0.55, duration: 0.7, ease: [0.3, 0.7, 0.2, 1] }, opacity: { duration: 0.2 } }}
        >
          <div className="blueprint-grid absolute inset-0 rounded-md bg-planner/5" />
          <div className="absolute left-2 top-1.5 text-[10px] font-bold uppercase tracking-widest text-planner">{bp.label} · {bp.kind}</div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="absolute -bottom-6 right-0 rounded bg-planner px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground">
            {Math.round(slot.w)} × {h} px
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
