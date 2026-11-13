import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Wand2 } from "lucide-react";
import { useStaffroom } from "@/staffroom/DocumentStore";
import { AGENTS } from "@/staffroom/agents";
import type { Field, Row } from "@/staffroom/types";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<Field["status"], string> = {
  empty: "Empty", editing: "Editing", checking: "Reviewing", complete: "Drafted", warning: "Issue found", corrected: "Corrected", approved: "Verified",
};
const ROW_TONE: Record<Row["status"], string> = {
  new: "", checking: "bg-reviewer/10", ok: "", warning: "bg-reviewer/15", corrected: "bg-corrector/10", proposed: "bg-corrector/10", missing: "bg-destructive/10", approved: "bg-writer/10",
};

function Caret({ agent }: { agent: Field["activeAgent"] }) {
  if (!agent) return null;
  return <span data-caret={agent} className={cn("caret-blink ml-px inline-block h-[1.05em] w-[2px] translate-y-[2px]", AGENTS[agent].bg)} />;
}

function FieldBody({ f, duration }: { f: Field; duration?: number | undefined }) {
  if (f.kind === "text") {
    if (!f.text && f.status === "empty") return <p className="text-sm italic text-muted-foreground">{f.placeholder ?? "Awaiting Writer…"}</p>;
    return (
      <p className="whitespace-pre-line font-doc text-[15px] leading-relaxed text-foreground">
        {f.text}
        {f.status === "editing" && <Caret agent={f.activeAgent} />}
      </p>
    );
  }
  if (f.kind === "kv") {
    return (
      <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
        <AnimatePresence initial={false}>
          {f.rows.map((r) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2 border-b border-dashed pb-1">
              <dt className="w-24 shrink-0 text-muted-foreground">{r.cells.k}</dt>
              <dd className={cn("font-medium", !r.cells.v && "text-destructive")}>{r.cells.v || "Missing"}</dd>
            </motion.div>
          ))}
        </AnimatePresence>
        {f.rows.length === 0 && <p className="col-span-2 text-sm italic text-muted-foreground">Awaiting details…</p>}
      </dl>
    );
  }
  const hasMinutes = f.columns.some((c) => c.key === "minutes");
  const total = f.rows.reduce((a, r) => a + (Number(r.cells.minutes) || 0), 0);
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>{f.columns.map((c) => <th key={c.key} className={cn("px-3 py-2 font-semibold", c.align === "right" && "text-right", c.align === "center" && "text-center")}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {f.rows.map((r) => (
              <motion.tr key={r.id} data-field-id={r.id} layout initial={{ opacity: 0, x: -10, backgroundColor: "var(--row-flash)" }} animate={{ opacity: 1, x: 0, backgroundColor: "transparent" }} transition={{ duration: 0.5 }} className={cn("border-t align-top transition-colors", ROW_TONE[r.status])}>
                {f.columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2", c.align === "right" && "text-right tabular-nums", c.align === "center" && "text-center tabular-nums")}>
                    {c.key === "recorded" && r.cells.proposed ? (
                      <span><s className="text-muted-foreground">{r.cells.recorded || "—"}</s> <b className="text-corrector">{r.cells.proposed}</b></span>
                    ) : r.cells[c.key] === "" ? <span className="text-destructive">—</span> : r.cells[c.key]}
                  </td>
                ))}
              </motion.tr>
            ))}
          </AnimatePresence>
          {f.rows.length === 0 && <tr><td colSpan={f.columns.length} className="px-3 py-4 text-center italic text-muted-foreground">Awaiting rows…</td></tr>}
        </tbody>
        {hasMinutes && f.rows.length > 0 && duration != null && (
          <tfoot>
            <tr className={cn("border-t font-semibold", total !== duration ? "text-reviewer" : "text-writer")}>
              <td className="px-3 py-2" colSpan={f.columns.length - 1}>Total time</td>
              <td className="px-3 py-2 text-right tabular-nums">{total} / {duration}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {f.rows.some((r) => r.note && r.status !== "ok") && (
        <ul className="space-y-0.5 border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {f.rows.filter((r) => r.note && r.status !== "ok").map((r) => <li key={r.id}>{r.cells.phase ? <b>{r.cells.phase}: </b> : null}{r.note}</li>)}
        </ul>
      )}
    </div>
  );
}

function FieldBlock({ f, duration }: { f: Field; duration?: number | undefined }) {
  const active = f.activeAgent ? AGENTS[f.activeAgent] : null;
  return (
    <motion.section
      data-field-id={f.id}
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 24 }}
      className={cn(
        "field-block relative rounded-lg border border-transparent p-4 transition-colors duration-300",
        f.status === "empty" && "border-dashed border-border",
        active && `ring-2 ${active.ring} ${active.soft}`,
        !active && f.status === "warning" && "border-reviewer bg-reviewer/5",
        !active && f.status === "corrected" && "border-corrector/50 bg-corrector/5",
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-foreground">{f.label}</h3>
        <span className={cn("no-print inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          f.status === "approved" ? "bg-writer/15 text-writer" : f.status === "warning" ? "bg-reviewer/15 text-reviewer" : f.status === "corrected" ? "bg-corrector/15 text-corrector" : "bg-muted text-muted-foreground")}>
          {f.status === "approved" && <CheckCircle2 className="h-3 w-3" />}
          {f.status === "warning" && <AlertTriangle className="h-3 w-3" />}
          {f.status === "corrected" && <Wand2 className="h-3 w-3" />}
          {STATUS_LABEL[f.status]}
        </span>
      </header>
      <FieldBody f={f} duration={duration} />
      <AnimatePresence>
        {f.issues.length > 0 && (
          <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="no-print mt-3 space-y-1">
            {f.issues.map((i) => <li key={i} className="flex items-start gap-1.5 rounded-md bg-reviewer/10 px-2 py-1 text-xs text-reviewer"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{i}</li>)}
          </motion.ul>
        )}
      </AnimatePresence>
      {f.note && <p className="mt-2 flex items-center gap-1.5 text-xs text-corrector"><Wand2 className="h-3 w-3" />{f.note}</p>}
    </motion.section>
  );
}

export function DocumentCanvas() {
  const s = useStaffroom((x) => x);
  const stamp = { empty: "Blank", draft: "Draft", provisional: "Provisional", approved: "Approved" }[s.status];
  return (
    <article id="print-doc" className="paper mx-auto min-h-[1123px] w-[794px] bg-card px-14 py-12 text-card-foreground shadow-paper">
      {!s.input ? (
        <div className="flex h-[900px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <div className="font-display text-2xl font-bold text-foreground">Blank document</div>
          <p className="max-w-sm text-sm">Snap or upload a handwritten marksheet on the left. The AI colleagues will read it, ask you about anything unclear, and write the register here.</p>
        </div>
      ) : (
        <>
          <div className="mb-8 flex items-start justify-between border-b-2 border-foreground pb-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{s.input.school}</div>
              <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">{s.title}</h1>
              <div className="mt-1 text-sm text-muted-foreground">{s.input.subject} · Grade {s.input.grade} · {s.input.topic}</div>
            </div>
            <motion.span key={s.status} data-field-id="doc-seal" initial={{ scale: 1.25, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className={cn("rounded border-2 px-3 py-1 font-display text-xs font-extrabold uppercase tracking-[0.2em]",
              s.status === "approved" ? "border-writer text-writer" : s.status === "provisional" ? "border-corrector text-corrector" : "border-muted-foreground text-muted-foreground")}>
              {stamp}
            </motion.span>
          </div>
          <div className="space-y-4">
            {s.order.map((id) => <FieldBlock key={id} f={s.fields[id]!} duration={s.input?.type === "lesson" ? s.input.duration : undefined} />)}
            <div data-doc-end className="h-0" />
          </div>
          <footer className="mt-10 border-t pt-3 text-[10px] text-muted-foreground">
            {stamp} document · Prepared with Staffroom ({s.control.live ? "written by live AI agents" : "demo mode — scripted colleagues"}; every total checked by deterministic code). Verify before official use.
          </footer>
        </>
      )}
    </article>
  );
}
