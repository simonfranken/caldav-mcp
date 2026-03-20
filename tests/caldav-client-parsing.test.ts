import { describe, expect, it } from "vitest";
import { hasDavNode, toDavText } from "../src/caldav/client.js";

describe("DAV parsing helpers", () => {
  it("detects nodes in nested DAV object trees", () => {
    const resourcetype = {
      collection: "",
      calendar: "",
    };

    expect(hasDavNode(resourcetype, "calendar")).toBe(true);
    expect(hasDavNode(resourcetype, "write")).toBe(false);
  });

  it("detects privileges and components in nested values", () => {
    const privileges = {
      privilege: [{ read: "" }, { write: "" }],
    };
    const components = {
      comp: [{ "@_name": "VEVENT" }, { "@_name": "VTODO" }],
    };

    expect(hasDavNode(privileges, "write")).toBe(true);
    expect(hasDavNode(components, "VEVENT")).toBe(true);
    expect(hasDavNode(components, "VJOURNAL")).toBe(false);
  });

  it("extracts text from nested DAV displayname values", () => {
    expect(toDavText(" Personal Calendar ")).toBe("Personal Calendar");
    expect(toDavText({ "#text": "Work" })).toBe("Work");
  });
});
