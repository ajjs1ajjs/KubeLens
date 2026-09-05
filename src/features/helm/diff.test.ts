import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";

describe("diffLines", () => {
  it("reports no changes for identical text", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.op === "equal")).toBe(true);
  });

  it("detects additions", () => {
    const lines = diffLines("a\nc", "a\nb\nc");
    const adds = lines.filter((l) => l.op === "add");
    expect(adds).toHaveLength(1);
    expect(adds[0].text).toBe("b");
    expect(lines).toContainEqual({ op: "add", text: "b", newLine: 2 });
  });

  it("detects removals", () => {
    const lines = diffLines("a\nb\nc", "a\nc");
    const removals = lines.filter((l) => l.op === "remove");
    expect(removals).toHaveLength(1);
    expect(removals[0].text).toBe("b");
  });

  it("handles full replacement", () => {
    const lines = diffLines("x\ny", "p\nq");
    expect(lines.filter((l) => l.op === "add")).toHaveLength(2);
    expect(lines.filter((l) => l.op === "remove")).toHaveLength(2);
    expect(lines.filter((l) => l.op === "equal")).toHaveLength(0);
  });

  it("handles empty strings", () => {
    expect(diffLines("", "")).toHaveLength(0);
    expect(diffLines("a", "")).toEqual([{ op: "remove", text: "a", oldLine: 1 }]);
    expect(diffLines("", "a")).toEqual([{ op: "add", text: "a", newLine: 1 }]);
  });

  it("assigns old/new line numbers correctly", () => {
    const lines = diffLines("a\nb\nc\nd", "a\nx\nc\nd");
    const equal = lines.filter((l) => l.op === "equal");
    const remove = lines.find((l) => l.op === "remove");
    const add = lines.find((l) => l.op === "add");
    expect(remove?.oldLine).toBe(2);
    expect(add?.newLine).toBe(2);
    // a (1,1), c (3,3), d (4,4) preserved
    expect(equal.some((l) => l.text === "a" && l.oldLine === 1 && l.newLine === 1)).toBe(true);
    expect(equal.some((l) => l.text === "c" && l.oldLine === 3 && l.newLine === 3)).toBe(true);
  });
});
