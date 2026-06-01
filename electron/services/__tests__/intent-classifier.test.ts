import { describe, it, expect } from "vitest";
import { classifyIntent } from "../intent-classifier";

describe("classifyIntent", () => {
  it("classifies short greetings as greeting", () => {
    expect(classifyIntent("hi")).toBe("greeting");
    expect(classifyIntent("hey")).toBe("greeting");
    expect(classifyIntent("hello")).toBe("greeting");
    expect(classifyIntent("嗨")).toBe("greeting");
    expect(classifyIntent("你好")).toBe("greeting");
    expect(classifyIntent("早")).toBe("greeting");
    expect(classifyIntent("在吗")).toBe("greeting");
  });

  it("classifies alternative greeting forms as greeting", () => {
    // forms that previously fell through to task
    expect(classifyIntent("hi there")).toBe("greeting");
    expect(classifyIntent("hey man")).toBe("greeting");
    expect(classifyIntent("morning")).toBe("greeting");
    expect(classifyIntent("good morning")).toBe("greeting");
    expect(classifyIntent("good evening")).toBe("greeting");
    expect(classifyIntent("yo!")).toBe("greeting");
    expect(classifyIntent("嘿")).toBe("greeting");
    expect(classifyIntent("在不在")).toBe("greeting");
    expect(classifyIntent("你好啊")).toBe("greeting");
    expect(classifyIntent("你好呀～")).toBe("greeting");
    expect(classifyIntent("哈喽")).toBe("greeting");
    expect(classifyIntent("晚上好啊")).toBe("greeting");
    expect(classifyIntent("hello 👋")).toBe("greeting");
  });

  it("classifies task messages as task", () => {
    expect(classifyIntent("帮我写一份PRD")).toBe("task");
    expect(classifyIntent("打开百度并截图")).toBe("task");
    expect(classifyIntent("搜索竞品分析")).toBe("task");
    expect(classifyIntent("what is the status of the project?")).toBe("task");
    expect(classifyIntent("早点睡")).toBe("task");
  });

  it("does not treat a greeting-prefixed task as a greeting", () => {
    // "你好，帮我写PRD" carries a real request after the greeting
    expect(classifyIntent("你好，帮我写PRD")).toBe("task");
    expect(classifyIntent("hi can you help me")).toBe("task");
  });

  it("classifies very long greetings as task", () => {
    expect(classifyIntent("hi how are you doing today")).toBe("task");
  });

  it("handles whitespace", () => {
    expect(classifyIntent("  hi  ")).toBe("greeting");
    expect(classifyIntent("")).toBe("task");
  });

  it("greeting detection is independent of agent mode (caller must not gate on mode)", () => {
    // Regression: greetings were only routed in "auto" mode, so a "hi" sent in
    // "execute" mode still fell through to the orchestrator's numbered task menu.
    // classifyIntent itself takes no mode, guaranteeing mode-independent routing.
    expect(classifyIntent("hi")).toBe("greeting");
    expect(classifyIntent("你好")).toBe("greeting");
  });
});
