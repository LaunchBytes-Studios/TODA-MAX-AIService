type GeminiResponseRecord = Record<string, unknown>;

const asRecord = (value: unknown): GeminiResponseRecord | null =>
  typeof value === "object" && value !== null
    ? (value as GeminiResponseRecord)
    : null;

const readString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const readTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const joinTextParts = (parts: unknown): string | undefined => {
  if (!Array.isArray(parts)) {
    return undefined;
  }

  const text = parts
    .map((part) => {
      const record = asRecord(part);
      return readString(record?.["text"]) ?? "";
    })
    .join("")
    .trim();

  return text || undefined;
};

const extractCandidateText = (candidate: unknown): string | undefined => {
  const record = asRecord(candidate);
  if (!record) {
    return undefined;
  }

  return (
    readTrimmedString(record["outputText"]) ??
    joinTextParts(record["content"]) ??
    joinTextParts(asRecord(record["content"])?.["parts"]) ??
    readTrimmedString(record["text"])
  );
};

export const extractGeminiText = (response: unknown): string | undefined => {
  const record = asRecord(response);
  if (!record) {
    return undefined;
  }

  const topLevelOutputText = readTrimmedString(record["outputText"]);
  if (topLevelOutputText) {
    return topLevelOutputText;
  }

  if (Array.isArray(record["candidates"])) {
    for (const candidate of record["candidates"]) {
      const text = extractCandidateText(candidate);
      if (text) {
        return text;
      }
    }
  }

  if (Array.isArray(record["output"])) {
    for (const item of record["output"]) {
      const text =
        joinTextParts(asRecord(item)?.["content"]) ??
        joinTextParts(asRecord(asRecord(item)?.["content"])?.["parts"]) ??
        readTrimmedString(asRecord(item)?.["text"]);
      if (text) {
        return text;
      }
    }
  }

  return readTrimmedString(record["text"]);
};

export const extractGeminiUsageMetadata = (response: unknown): unknown => {
  const record = asRecord(response);
  if (!record) {
    return null;
  }

  return record["usage"] ?? record["usageMetadata"] ?? null;
};

export const normalizeGeminiResponse = (response: unknown) => ({
  text: extractGeminiText(response),
  usageMetadata: extractGeminiUsageMetadata(response),
});
