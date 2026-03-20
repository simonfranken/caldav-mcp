import { describe, expect, it } from "vitest";
import { ensureUid, validateIcsEvent } from "../src/ics.js";
import { ValidationError } from "../src/errors.js";

describe("ics helpers", () => {
  it("adds UID when missing", () => {
    const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260101T100000Z\nDTEND:20260101T110000Z\nEND:VEVENT\nEND:VCALENDAR`;
    const output = ensureUid(ics);
    expect(output.uid).toBeTruthy();
    expect(output.ics).toContain(`UID:${output.uid}`);
  });

  it("rejects DTEND before DTSTART", () => {
    const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:abc\nDTSTART:20260102T100000Z\nDTEND:20260101T100000Z\nEND:VEVENT\nEND:VCALENDAR`;
    expect(() => validateIcsEvent(ics)).toThrow(ValidationError);
  });
});
