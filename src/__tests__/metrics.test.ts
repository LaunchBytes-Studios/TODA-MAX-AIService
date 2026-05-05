import { describe, it, expect } from "vitest";
import { findMetricByMessage } from "../chatbot/utils/metrics";
import { buildNormalValueReply } from "../chatbot/llm/chat.service";

describe("metrics lookup and reply builder", () => {
  it("finds blood sugar metric", () => {
    const m = findMetricByMessage("ano ang normal blood sugar?");
    expect(m).not.toBeNull();
    expect(m?.key).toBe("bloodSugar");
  });

  it("builds a short reply for blood sugar (english)", () => {
    const reply = buildNormalValueReply(
      "what is normal blood sugar",
      "english",
    );
    expect(typeof reply).toBe("string");
    expect(reply.length).toBeGreaterThan(10);
  });
});
