import { Config } from "../config.js";
import { CaldavHttpError, ValidationError } from "../errors.js";
import { Logger } from "../logger.js";
import { normalizeHref, normalizeIdFromHref, joinUrl } from "../util.js";
import {
  buildCalendarHomeSetPropfindBody,
  buildCalendarListPropfindBody,
  buildCalendarQueryBody,
  buildCurrentUserPrincipalPropfindBody,
  buildMkcalendarBody,
  buildProppatchDisplayNameBody,
  parseMultiStatus,
} from "./xml.js";
import { ensureUid, extractIcsField, validateIcsEvent } from "../ics.js";

export interface AuthHeaders {
  authorization?: string;
  cookie?: string;
}

export interface RequestContext {
  correlationId: string;
  auth: AuthHeaders;
}

export interface PrincipalInfo {
  principalHref: string;
  calendarHomeHref: string;
}

export interface CalendarInfo {
  id: string;
  href: string;
  displayName: string;
  etag?: string;
  writable: boolean;
  components: string[];
}

export interface EventInfo {
  id: string;
  href: string;
  etag?: string;
  uid?: string;
}

export class CaldavClient {
  constructor(
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  async discoverPrincipal(context: RequestContext): Promise<PrincipalInfo> {
    const principalDoc = await this.request({
      context,
      method: "PROPFIND",
      url: this.config.CALDAV_BASE_URL,
      headers: { Depth: "0", "Content-Type": "application/xml; charset=utf-8" },
      body: buildCurrentUserPrincipalPropfindBody(),
      expectMultistatus: true,
      idempotent: true,
    });

    const principalHref = this.extractHrefProp(principalDoc.body, "current-user-principal");
    if (!principalHref) {
      throw new ValidationError("Unable to resolve current-user-principal");
    }
    const normalizedPrincipal = normalizeHref(principalHref, this.config.CALDAV_BASE_URL);

    const homeDoc = await this.request({
      context,
      method: "PROPFIND",
      url: normalizedPrincipal,
      headers: { Depth: "0", "Content-Type": "application/xml; charset=utf-8" },
      body: buildCalendarHomeSetPropfindBody(),
      expectMultistatus: true,
      idempotent: true,
    });

    const calendarHomeHref = this.extractHrefProp(homeDoc.body, "calendar-home-set");
    if (!calendarHomeHref) {
      throw new ValidationError("Unable to resolve calendar-home-set");
    }

    return {
      principalHref: normalizedPrincipal,
      calendarHomeHref: normalizeHref(calendarHomeHref, this.config.CALDAV_BASE_URL),
    };
  }

  async listCalendars(context: RequestContext, principal: PrincipalInfo): Promise<CalendarInfo[]> {
    const response = await this.request({
      context,
      method: "PROPFIND",
      url: principal.calendarHomeHref,
      headers: { Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
      body: buildCalendarListPropfindBody(),
      expectMultistatus: true,
      idempotent: true,
    });

    const resources = parseMultiStatus(response.body ?? "");
    return resources
      .map((resource): CalendarInfo | undefined => {
        const href = normalizeHref(resource.href, principal.calendarHomeHref);
        if (href === principal.calendarHomeHref) {
          return undefined;
        }
        const ok = resource.statuses.find((status) => status.status >= 200 && status.status < 300);
        if (!ok) {
          return undefined;
        }
        if (!hasDavNode(ok.props.resourcetype, "calendar")) {
          return undefined;
        }

        const displayName = toDavText(ok.props.displayname) ?? normalizeIdFromHref(href);
        const etag = normalizeEtag(ok.props.getetag);
        const writable = hasDavNode(ok.props["current-user-privilege-set"], "write");
        const components = ["VEVENT", "VTODO", "VJOURNAL"].filter((component) => hasDavNode(ok.props["supported-calendar-component-set"], component));

        const calendar: CalendarInfo = {
          id: normalizeIdFromHref(href),
          href,
          displayName,
          writable,
          components,
        };
        if (etag) {
          calendar.etag = etag;
        }
        return calendar;
      })
      .filter((item): item is CalendarInfo => Boolean(item));
  }

  async getCapabilities(context: RequestContext, calendarHomeHref: string): Promise<{ canMkcalendar: boolean; canProppatch: boolean }> {
    const response = await this.request({
      context,
      method: "OPTIONS",
      url: calendarHomeHref,
      idempotent: true,
    });
    const allow = response.headers.get("allow") ?? "";
    return {
      canMkcalendar: allow.toUpperCase().includes("MKCALENDAR"),
      canProppatch: allow.toUpperCase().includes("PROPPATCH"),
    };
  }

  async createCalendar(context: RequestContext, calendarHomeHref: string, name: string, slug: string): Promise<{ href: string }> {
    const href = joinUrl(calendarHomeHref, `${slug}/`);
    await this.request({
      context,
      method: "MKCALENDAR",
      url: href,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
      body: buildMkcalendarBody(name),
      expectedStatus: [201, 200],
      idempotent: false,
    });
    return { href };
  }

  async updateCalendar(context: RequestContext, calendarHref: string, displayName: string): Promise<void> {
    await this.request({
      context,
      method: "PROPPATCH",
      url: calendarHref,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
      body: buildProppatchDisplayNameBody(displayName),
      expectedStatus: [200, 207],
      idempotent: false,
    });
  }

  async deleteCalendar(context: RequestContext, calendarHref: string, etag?: string): Promise<void> {
    await this.request({
      context,
      method: "DELETE",
      url: calendarHref,
      headers: buildIfMatchHeader(etag),
      expectedStatus: [200, 204],
      idempotent: true,
    });
  }

  async listEvents(context: RequestContext, calendarHref: string, rangeStart: string, rangeEnd: string): Promise<EventInfo[]> {
    const response = await this.request({
      context,
      method: "REPORT",
      url: calendarHref,
      headers: { Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
      body: buildCalendarQueryBody(rangeStart, rangeEnd),
      expectMultistatus: true,
      idempotent: true,
    });

    const resources = parseMultiStatus(response.body ?? "");
    return resources
      .map((resource): EventInfo | undefined => {
        const href = normalizeHref(resource.href, calendarHref);
        const ok = resource.statuses.find((status) => status.status >= 200 && status.status < 300);
        if (!ok) {
          return undefined;
        }
        const etag = normalizeEtag(ok.props.getetag);
        const event: EventInfo = {
          id: normalizeIdFromHref(href),
          href,
        };
        if (etag) {
          event.etag = etag;
        }
        return event;
      })
      .filter((item): item is EventInfo => Boolean(item));
  }

  async getEvent(context: RequestContext, eventHref: string): Promise<{ href: string; etag?: string; ics: string; uid?: string }> {
    const response = await this.request({
      context,
      method: "GET",
      url: eventHref,
      expectedStatus: [200],
      idempotent: true,
    });
    const ics = response.body ?? "";
    return {
      href: eventHref,
      etag: normalizeEtag(response.headers.get("etag") ?? undefined),
      uid: extractIcsField(ics, "UID"),
      ics,
    };
  }

  async createEvent(context: RequestContext, calendarHref: string, ics: string, eventHref?: string): Promise<{ href: string; etag?: string; uid?: string }> {
    const ensured = ensureUid(ics);
    validateIcsEvent(ensured.ics);
    const href = eventHref ?? this.makeEventHref(calendarHref, ensured.uid);

    const response = await this.request({
      context,
      method: "PUT",
      url: href,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "If-None-Match": "*",
      },
      body: ensured.ics,
      expectedStatus: [201, 204],
      idempotent: false,
    });

    return { href, etag: normalizeEtag(response.headers.get("etag") ?? undefined), uid: ensured.uid };
  }

  async updateEvent(context: RequestContext, eventHref: string, ics: string, etag?: string): Promise<{ etag?: string; uid?: string }> {
    validateIcsEvent(ics);
    const response = await this.request({
      context,
      method: "PUT",
      url: eventHref,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        ...buildIfMatchHeader(etag),
      },
      body: ics,
      expectedStatus: [200, 201, 204],
      idempotent: false,
    });

    return { etag: normalizeEtag(response.headers.get("etag") ?? undefined), uid: extractIcsField(ics, "UID") };
  }

  async deleteEvent(context: RequestContext, eventHref: string, etag?: string): Promise<void> {
    await this.request({
      context,
      method: "DELETE",
      url: eventHref,
      headers: buildIfMatchHeader(etag),
      expectedStatus: [200, 204],
      idempotent: true,
    });
  }

  private async request(input: {
    context: RequestContext;
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    expectedStatus?: number[];
    expectMultistatus?: boolean;
    idempotent: boolean;
  }): Promise<{ status: number; body?: string; headers: Headers }> {
    const attempts = input.idempotent ? this.config.CALDAV_RETRY_COUNT + 1 : 1;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const headers: Record<string, string> = {
        "User-Agent": "caldav-mcp/0.1.0",
        "X-Request-ID": input.context.correlationId,
        ...input.headers,
      };

      if (input.context.auth.authorization) {
        headers.Authorization = input.context.auth.authorization;
      }
      if (input.context.auth.cookie && this.config.ALLOW_COOKIE_PASSTHROUGH) {
        headers.Cookie = input.context.auth.cookie;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.CALDAV_TIMEOUT_MS);
      try {
        const response = await fetch(input.url, {
          method: input.method,
          headers,
          body: input.body,
          signal: controller.signal,
        });
        clearTimeout(timer);

        const okStatuses = input.expectedStatus ?? (input.expectMultistatus ? [207] : [200, 201, 204]);
        if (!okStatuses.includes(response.status)) {
          const body = await response.text().catch(() => "");
          throw new CaldavHttpError(response.status, input.method, input.url, body.slice(0, 1000));
        }

        const body = response.status === 204 ? undefined : await response.text().catch(() => undefined);
        return {
          status: response.status,
          body,
          headers: response.headers,
        };
      } catch (error) {
        clearTimeout(timer);
        if (attempt >= attempts) {
          throw error;
        }
        this.logger.warn("Retrying idempotent CalDAV request", {
          correlationId: input.context.correlationId,
          method: input.method,
          url: input.url,
          attempt,
        });
      }
    }

    throw new Error("Unreachable retry state");
  }

  private extractHrefProp(xml: string | undefined, propName: string): string | undefined {
    if (!xml) {
      return undefined;
    }
    const resources = parseMultiStatus(xml);
    for (const resource of resources) {
      for (const status of resource.statuses) {
        const value = status.props[propName];
        if (typeof value === "object" && value && "href" in (value as Record<string, unknown>)) {
          const href = (value as Record<string, unknown>).href;
          return href ? String(href) : undefined;
        }
        if (typeof value === "string" && value.trim().length > 0) {
          return value;
        }
      }
    }
    return undefined;
  }

  private makeEventHref(calendarHref: string, uid: string): string {
    const safe = uid.toLowerCase().replace(/[^a-z0-9-_.]/g, "-");
    return joinUrl(calendarHref, `${safe}.ics`);
  }
}

export function buildIfMatchHeader(etag?: string): Record<string, string> {
  if (!etag) {
    return {};
  }
  return { "If-Match": etag };
}

function normalizeEtag(input: unknown): string | undefined {
  if (!input) {
    return undefined;
  }
  return String(input).trim();
}

export function hasDavNode(value: unknown, nodeName: string): boolean {
  const target = nodeName.toLowerCase();
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.toLowerCase().includes(target);
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasDavNode(item, nodeName));
  }
  if (typeof value === "object") {
    return Object.entries(value).some(([key, child]) => {
      if (key.toLowerCase() === target) {
        return true;
      }
      return hasDavNode(child, nodeName);
    });
  }
  return false;
}

export function toDavText(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = toDavText(item);
      if (text) {
        return text;
      }
    }
    return undefined;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value)) {
      const text = toDavText(child);
      if (text) {
        return text;
      }
    }
  }
  return undefined;
}
