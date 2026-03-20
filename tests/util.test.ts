import { describe, expect, it } from "vitest";
import { normalizeHref } from "../src/util.js";

describe("normalizeHref", () => {
  it("resolves relative href against base", () => {
    const href = normalizeHref("/caldav/user/Calendar/personal/", "https://caldav.example.com/caldav");
    expect(href).toBe("https://caldav.example.com/caldav/user/Calendar/personal/");
  });

  it("strips URL fragment", () => {
    const href = normalizeHref("https://caldav.example.com/caldav/user/Calendar/personal/#fragment", "https://caldav.example.com/caldav");
    expect(href).toBe("https://caldav.example.com/caldav/user/Calendar/personal/");
  });
});
