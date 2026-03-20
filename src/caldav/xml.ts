import { XMLBuilder, XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  suppressEmptyNode: true,
});

export type DavPropMap = Record<string, unknown>;

export interface DavResponse {
  href: string;
  statuses: Array<{ status: number; props: DavPropMap }>;
}

export function parseMultiStatus(xml: string): DavResponse[] {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const multiStatus = (parsed.multistatus ?? parsed["d:multistatus"]) as Record<string, unknown> | undefined;
  if (!multiStatus) {
    return [];
  }

  const responses = ensureArray(multiStatus.response) as Array<Record<string, unknown>>;
  return responses.map((response) => {
    const href = String(response.href ?? "");
    const propstats = ensureArray(response.propstat) as Array<Record<string, unknown>>;
    const statuses = propstats.map((propstat) => {
      const statusCode = parseStatusCode(String(propstat.status ?? "HTTP/1.1 500"));
      const prop = (propstat.prop ?? {}) as Record<string, unknown>;
      return {
        status: statusCode,
        props: flattenProps(prop),
      };
    });
    return { href, statuses };
  });
}

export function buildCurrentUserPrincipalPropfindBody(): string {
  return builder.build({
    "d:propfind": {
      "@_xmlns:d": "DAV:",
      "d:prop": {
        "d:current-user-principal": {},
      },
    },
  });
}

export function buildCalendarHomeSetPropfindBody(): string {
  return builder.build({
    "d:propfind": {
      "@_xmlns:d": "DAV:",
      "@_xmlns:c": "urn:ietf:params:xml:ns:caldav",
      "d:prop": {
        "c:calendar-home-set": {},
      },
    },
  });
}

export function buildCalendarListPropfindBody(): string {
  return builder.build({
    "d:propfind": {
      "@_xmlns:d": "DAV:",
      "@_xmlns:c": "urn:ietf:params:xml:ns:caldav",
      "d:prop": {
        "d:displayname": {},
        "d:resourcetype": {},
        "d:current-user-privilege-set": {},
        "d:getetag": {},
        "c:supported-calendar-component-set": {},
      },
    },
  });
}

export function buildCalendarQueryBody(start: string, end: string): string {
  return builder.build({
    "c:calendar-query": {
      "@_xmlns:d": "DAV:",
      "@_xmlns:c": "urn:ietf:params:xml:ns:caldav",
      "d:prop": {
        "d:getetag": {},
      },
      "c:filter": {
        "c:comp-filter": {
          "@_name": "VCALENDAR",
          "c:comp-filter": {
            "@_name": "VEVENT",
            "c:time-range": {
              "@_start": start,
              "@_end": end,
            },
          },
        },
      },
    },
  });
}

export function buildMkcalendarBody(displayName: string): string {
  return builder.build({
    "c:mkcalendar": {
      "@_xmlns:d": "DAV:",
      "@_xmlns:c": "urn:ietf:params:xml:ns:caldav",
      "d:set": {
        "d:prop": {
          "d:displayname": displayName,
        },
      },
    },
  });
}

export function buildProppatchDisplayNameBody(displayName: string): string {
  return builder.build({
    "d:propertyupdate": {
      "@_xmlns:d": "DAV:",
      "d:set": {
        "d:prop": {
          "d:displayname": displayName,
        },
      },
    },
  });
}

function flattenProps(prop: Record<string, unknown>): DavPropMap {
  const output: DavPropMap = {};
  for (const [key, value] of Object.entries(prop)) {
    output[key] = value;
  }
  return output;
}

function parseStatusCode(statusLine: string): number {
  const match = statusLine.match(/\s(\d{3})\s/);
  if (!match) {
    return 500;
  }
  return Number(match[1]);
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
