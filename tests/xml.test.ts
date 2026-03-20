import { describe, expect, it } from "vitest";
import { parseMultiStatus } from "../src/caldav/xml.js";

describe("parseMultiStatus", () => {
  it("parses href and props from multistatus response", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/SOGo/dav/user/Calendar/personal/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Personal</d:displayname>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

    const parsed = parseMultiStatus(xml);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].href).toBe("/SOGo/dav/user/Calendar/personal/");
    expect(parsed[0].statuses[0].status).toBe(200);
    expect(parsed[0].statuses[0].props.displayname).toBe("Personal");
  });
});
