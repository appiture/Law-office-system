import { describe, expect, it } from "vitest";
import { assertHearingPayload } from "../../utils/validation";

describe("hearing payload validation", () => {
  it("accepts the repository field names used by timeline actions", () => {
    expect(() => assertHearingPayload({
      type: "HEARING",
      title: "Evidence hearing",
      scheduledAt: "2026-05-20T10:30",
      status: "PENDING",
    })).not.toThrow();
  });

  it("accepts the form field names used by the hearings modal", () => {
    expect(() => assertHearingPayload({
      type: "HEARING",
      case_title: "Evidence hearing",
      hearing_date: "2026-05-20T10:30",
      status: "PENDING",
    })).not.toThrow();
  });
});
