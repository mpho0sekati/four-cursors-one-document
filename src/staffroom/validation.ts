// Pure, deterministic checks used by the Reviewer and fixes used by the Corrector.

export function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

export function checkLessonDuration(minutes: number[], duration: number): { ok: boolean; total: number; over: number } {
  const total = sum(minutes);
  return { ok: total === duration && minutes.every((m) => m > 0), total, over: total - duration };
}

/** Scale activity timings proportionally so they add up exactly to the lesson duration. */
export function rebalanceMinutes(mins: number[], target: number, min = 3): number[] {
  const total = sum(mins);
  if (total <= 0 || mins.length === 0) return mins;
  const raw = mins.map((m) => (m * target) / total);
  const out = raw.map((r) => Math.max(min, Math.floor(r)));
  let diff = target - sum(out);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  let k = 0;
  while (diff > 0) { out[order[k % order.length]]++; diff--; k++; }
  while (diff < 0) {
    const i = out.indexOf(Math.max(...out));
    out[i]--; diff++;
  }
  return out;
}

/** Total of question marks; null when any mark is missing (never invent marks). */
export function computeTotal(marks: (number | null)[]): number | null {
  if (marks.some((m) => m === null)) return null;
  return sum(marks as number[]);
}

/** CAPS 7-point achievement scale. */
export function levelFromPercent(p: number): number {
  if (p >= 80) return 7;
  if (p >= 70) return 6;
  if (p >= 60) return 5;
  if (p >= 50) return 4;
  if (p >= 40) return 3;
  if (p >= 30) return 2;
  return 1;
}

/** The Writer's quick draft heuristic — deliberately unclamped, so 90%+ yields an invalid level 8. */
export function draftLevel(p: number): number {
  return Math.max(1, Math.floor(p / 10) - 1);
}

export function parseMarks(s: string): (number | null)[] {
  return s.split(",").map((x) => {
    const t = x.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  });
}
