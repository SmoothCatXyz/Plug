import { describe, it, expect } from "vitest";
import { parseKind } from "../work-classifier";

describe("parseKind", () => {
  it("maps clean model output", () => {
    expect(parseKind("work")).toBe("work");
    expect(parseKind("chat")).toBe("chat");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(parseKind("WORK")).toBe("work");
    expect(parseKind("  Chat  ")).toBe("chat");
    expect(parseKind("chat.")).toBe("chat");
    expect(parseKind("work\n")).toBe("work");
  });

  it("handles a word embedded in a short explanation", () => {
    expect(parseKind("this is work")).toBe("work");
    expect(parseKind("chat - small talk")).toBe("chat");
  });

  it("defaults ambiguous/garbage output to work (the capable path)", () => {
    expect(parseKind("")).toBe("work");
    expect(parseKind("不知道")).toBe("work");
    expect(parseKind("maybe")).toBe("work");
  });

  it("prefers work when both words appear (safety bias)", () => {
    expect(parseKind("work not chat")).toBe("work");
  });
});
