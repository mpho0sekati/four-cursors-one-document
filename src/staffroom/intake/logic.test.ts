import { describe, expect, it } from "vitest";
import { analyse, buildQuestions, confirm, remedialMission, toRegisterLearners, type Extraction } from "./logic";

const c = (value: number | null, state: "clear" | "unclear" | "blank" = "clear", alternatives: number[] = [], confidence = 0.95) => ({ value, state, confidence, alternatives });
const x: Extraction = {
  title: "", grade: "4", subject: "Maths", topic: "Fractions", maxes: [5, 5, 10],
  rows: [
    { name: "A", marks: [c(4), c(3), c(7)], recorded: c(14) },
    { name: "B", marks: [c(2), c(4), c(5, "unclear", [6], 0.5)], recorded: c(11) },
    { name: "C", marks: [c(5), c(null, "blank"), c(9)], recorded: c(null, "blank") },
  ],
};

describe("intake confirmation", () => {
  it("asks the teacher about an unclear mark but not a blank one", () => {
    const qs = buildQuestions(x);
    expect(qs.map((q) => q.id)).toEqual(["m-1-2"]);
    expect(qs[0]!.options).toEqual([5, 6]);
  });
  it("refuses to build the register while a question is open", () => {
    expect(() => confirm(x, buildQuestions(x), {})).toThrow(/teacher confirmation/);
  });
  it("uses the teacher's answer, not the AI's reading", () => {
    const conf = confirm(x, buildQuestions(x), { "m-1-2": 6 });
    expect(conf.rows[1]!.marks).toEqual([2, 4, 6]);
    expect(conf.rows[1]!.teacherConfirmed).toEqual([2]);
    expect(conf.rows[2]!.marks[1]).toBeNull();
    expect(toRegisterLearners(conf).split("\n")[2]).toBe("B | 2,4,6 | 11");
  });
  it("builds the follow-up plan from confirmed scores", () => {
    const conf = confirm(x, buildQuestions(x), { "m-1-2": 6 });
    const a = analyse(conf);
    expect(a.learners.map((l) => l.pct)).toEqual([70, 60, null]);
    expect(a.incomplete).toBe(1);
    expect(remedialMission(x, conf).learners).toBe("A | 70\nB | 60\nC | ");
  });
});
