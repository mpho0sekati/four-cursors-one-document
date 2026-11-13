import { describe, expect, it } from "vitest";
import { runGate, STALE_RUN_MS } from "./logic";

const now = 1_000_000_000;
describe("intake run gate (no duplicate agent runs)", () => {
  it("starts the register only once the teacher has answered", () => {
    expect(runGate("WAITING_FOR_TEACHER", "register", now, false, now).ok).toBe(false);
    expect(runGate("READY_FOR_REGISTER", "register", now, false, now).ok).toBe(true);
  });
  it("refuses a second register run while agents are working", () => {
    expect(runGate("REGISTER_RUNNING", "register", now - 1000, false, now).ok).toBe(false);
  });
  it("refuses to rebuild a register that is already verified", () => {
    expect(runGate("REGISTER_VERIFIED", "register", now, true, now).ok).toBe(false);
  });
  it("lets an interrupted run be restarted after 5 minutes", () => {
    expect(runGate("REGISTER_RUNNING", "register", now - STALE_RUN_MS - 1, false, now).ok).toBe(true);
    expect(runGate("PLAN_RUNNING", "plan", now - STALE_RUN_MS - 1, true, now).ok).toBe(true);
  });
  it("refuses a second plan run and a plan without a verified register", () => {
    expect(runGate("PLAN_RUNNING", "plan", now - 1000, true, now).ok).toBe(false);
    expect(runGate("PLAN_READY", "plan", now, true, now).ok).toBe(false);
    expect(runGate("READY_FOR_REGISTER", "plan", now, false, now).ok).toBe(false);
  });
});
