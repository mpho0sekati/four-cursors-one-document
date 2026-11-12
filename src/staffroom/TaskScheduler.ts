import type { AgentId, Task } from "./types";

/** Two targets conflict when equal, or one is a field and the other a row inside it. */
export function targetsConflict(a: string, b: string): boolean {
  if (a === b) return true;
  const fa = a.split("::")[0], fb = b.split("::")[0];
  return (fa === b && a !== fa) || (fb === a && b !== fb);
}

export class TaskScheduler {
  tasks: Task[] = [];
  locks = new Map<string, AgentId>();

  load(tasks: Task[]) { this.tasks = tasks; this.locks.clear(); }
  add(tasks: Task[]) { this.tasks.push(...tasks); }

  depsDone(t: Task) {
    return t.deps.every((d) => this.tasks.find((x) => x.id === d)?.status === "done");
  }
  isLocked(target: string, by: AgentId) {
    for (const [k, owner] of this.locks) if (owner !== by && targetsConflict(k, target)) return true;
    return false;
  }
  afterAllReady(t: Task) {
    return !t.afterAll || this.tasks.every((x) => x.afterAll || x.status === "done");
  }
  /** Next runnable task for an agent: dependencies met, target unlocked. */
  next(agent: AgentId): Task | undefined {
    return this.tasks.find((t) => t.agentId === agent && t.status === "pending" && this.depsDone(t) && this.afterAllReady(t) && !this.isLocked(t.targetId, agent));
  }
  /** Which agent is the blocker for this agent's next pending task (for the waiting bubble). */
  blocker(agent: AgentId): AgentId | null {
    const t = this.tasks.find((x) => x.agentId === agent && x.status === "pending");
    if (!t) return null;
    const dep = t.deps.map((d) => this.tasks.find((x) => x.id === d)).find((x) => x && x.status !== "done");
    if (dep) return dep.agentId;
    for (const [k, owner] of this.locks) if (targetsConflict(k, t.targetId)) return owner;
    const other = this.tasks.find((x) => !x.afterAll && x.status !== "done");
    return other ? other.agentId : null;
  }
  acquire(t: Task) { t.status = "running"; this.locks.set(t.targetId, t.agentId); }
  release(t: Task) { t.status = "done"; this.locks.delete(t.targetId); }
  get finished() { return this.tasks.every((t) => t.status === "done"); }
  get counts() { return { done: this.tasks.filter((t) => t.status === "done").length, total: this.tasks.length }; }
}
