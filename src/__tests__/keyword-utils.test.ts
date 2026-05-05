import { describe, it, expect } from "vitest";
import {
  isMedicationOrDosageQuestion,
  isNormalValueQuestion,
} from "../chatbot/utils/keyword-utils";

describe("keyword-utils detectors", () => {
  it("detects medication questions (Hiligaynon)", () => {
    expect(isMedicationOrDosageQuestion("Ano bulong pwede ko mainom?")).toBe(
      true,
    );
    expect(
      isMedicationOrDosageQuestion("Ano nga bulong pwede ko inumon?"),
    ).toBe(true);
  });

  it("detects medication questions (English)", () => {
    expect(isMedicationOrDosageQuestion("What medicine should I take?")).toBe(
      true,
    );
  });

  it("detects normal value questions", () => {
    expect(isNormalValueQuestion("Ano ang normal nga blood sugar level?")).toBe(
      true,
    );
    expect(isNormalValueQuestion("What is a normal blood pressure?")).toBe(
      true,
    );
  });
});
