import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CaldavClient } from "./caldav/client.js";
import { Config } from "./config.js";
import { mapErrorToMcp, UnauthenticatedError } from "./errors.js";
import { buildIcsFromStructured } from "./ics.js";
import { Logger } from "./logger.js";
import { getCorrelationId, getHeader, normalizeHref } from "./util.js";

interface ToolDeps {
  client: CaldavClient;
  config: Config;
  logger: Logger;
}

export function registerTools(server: McpServer, deps: ToolDeps): void {
  const { client, config, logger } = deps;

  const withContext = async <T>(
    extra: { requestInfo?: { headers: Record<string, string | string[] | undefined> } },
    callback: (ctx: { correlationId: string; auth: { authorization?: string; cookie?: string } }) => Promise<T>,
  ): Promise<T> => {
    try {
      const headers = extra.requestInfo?.headers ?? {};
      const authorization = getHeader(headers, "authorization");
      if (!authorization) {
        throw new UnauthenticatedError("Missing Authorization header");
      }
      const cookie = getHeader(headers, "cookie");
      const correlationId = getCorrelationId(headers);
      return await callback({ correlationId, auth: { authorization, cookie } });
    } catch (error) {
      logger.error("Tool execution failed", { error: error instanceof Error ? error.message : String(error) });
      throw mapErrorToMcp(error);
    }
  };

  server.registerTool(
    "caldav_discover_principal",
    {
      description: "Resolve current-user-principal and calendar-home-set for authenticated caller",
      inputSchema: z.object({}),
    },
    async (_args, extra) => {
      const result = await withContext(extra, async (context) => client.discoverPrincipal(context));
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { principal: result },
      };
    },
  );

  server.registerTool(
    "caldav_list_calendars",
    {
      description: "List calendars visible under principal",
      inputSchema: z.object({}),
    },
    async (_args, extra) => {
      const result = await withContext(extra, async (context) => {
        const principal = await client.discoverPrincipal(context);
        return client.listCalendars(context, principal);
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ calendars: result }, null, 2) }],
        structuredContent: { calendars: result },
      };
    },
  );

  server.registerTool(
    "caldav_create_calendar",
    {
      description: "Create a new calendar if server supports MKCALENDAR",
      inputSchema: z.object({
        displayName: z.string().min(1),
        slug: z.string().min(1),
      }),
    },
    async (args, extra) => {
      const result = await withContext(extra, async (context) => {
        const principal = await client.discoverPrincipal(context);
        const capabilities = await client.getCapabilities(context, principal.calendarHomeHref);
        if (!capabilities.canMkcalendar) {
          throw new Error("Upstream does not support MKCALENDAR");
        }
        return client.createCalendar(context, principal.calendarHomeHref, args.displayName, args.slug);
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: { result } };
    },
  );

  server.registerTool(
    "caldav_update_calendar",
    {
      description: "Update calendar displayname if PROPPATCH is supported",
      inputSchema: z.object({
        calendarHref: z.string().url(),
        displayName: z.string().min(1),
      }),
    },
    async (args, extra) => {
      const result = await withContext(extra, async (context) => {
        const principal = await client.discoverPrincipal(context);
        const capabilities = await client.getCapabilities(context, principal.calendarHomeHref);
        if (!capabilities.canProppatch) {
          throw new Error("Upstream does not support PROPPATCH");
        }
        await client.updateCalendar(context, normalizeHref(args.calendarHref, config.CALDAV_BASE_URL), args.displayName);
        return { href: normalizeHref(args.calendarHref, config.CALDAV_BASE_URL) };
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: { result } };
    },
  );

  server.registerTool(
    "caldav_delete_calendar",
    {
      description: "Delete a calendar",
      inputSchema: z.object({
        calendarHref: z.string().url(),
        etag: z.string().optional(),
      }),
    },
    async (args, extra) => {
      const result = await withContext(extra, async (context) => {
        const href = normalizeHref(args.calendarHref, config.CALDAV_BASE_URL);
        await client.deleteCalendar(context, href, args.etag);
        return { href, deleted: true };
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: { result } };
    },
  );

  server.registerTool(
    "caldav_list_events",
    {
      description: "List VEVENT resources in a time range",
      inputSchema: z.object({
        calendarHref: z.string().url(),
        rangeStart: z.string().min(1),
        rangeEnd: z.string().min(1),
      }),
    },
    async (args, extra) => {
      const result = await withContext(extra, async (context) => {
        const href = normalizeHref(args.calendarHref, config.CALDAV_BASE_URL);
        const events = await client.listEvents(context, href, args.rangeStart, args.rangeEnd);
        return { calendarHref: href, events };
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    },
  );

  server.registerTool(
    "caldav_get_event",
    {
      description: "Get event by href",
      inputSchema: z.object({
        eventHref: z.string().url(),
      }),
    },
    async (args, extra) => {
      const result = await withContext(extra, async (context) => {
        const href = normalizeHref(args.eventHref, config.CALDAV_BASE_URL);
        return client.getEvent(context, href);
      });
      return { content: [{ type: "text", text: result.ics }], structuredContent: { result } };
    },
  );

  server.registerTool(
    "caldav_create_event",
    {
      description: "Create a VEVENT resource from ICS or structured input",
      inputSchema: z
        .object({
          calendarHref: z.string().url(),
          eventHref: z.string().url().optional(),
          ics: z.string().optional(),
          event: z
            .object({
              uid: z.string().optional(),
              summary: z.string().optional(),
              description: z.string().optional(),
              location: z.string().optional(),
              dtstart: z.string(),
              dtend: z.string().optional(),
              timezone: z.string().optional(),
            })
            .optional(),
        })
        .refine((value) => Boolean(value.ics) || Boolean(value.event), "Provide either ics or event"),
    },
    async (args, extra) => {
      const result = await withContext(extra, async (context) => {
        const calendarHref = normalizeHref(args.calendarHref, config.CALDAV_BASE_URL);
        const eventHref = args.eventHref ? normalizeHref(args.eventHref, config.CALDAV_BASE_URL) : undefined;
        const ics = args.ics ?? buildIcsFromStructured(args.event!);
        return client.createEvent(context, calendarHref, ics, eventHref);
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: { result } };
    },
  );

  server.registerTool(
    "caldav_update_event",
    {
      description: "Update an existing VEVENT resource",
      inputSchema: z.object({
        eventHref: z.string().url(),
        ics: z.string(),
        etag: z.string().optional(),
      }),
    },
    async (args, extra) => {
      const result = await withContext(extra, async (context) => {
        const href = normalizeHref(args.eventHref, config.CALDAV_BASE_URL);
        const update = await client.updateEvent(context, href, args.ics, args.etag);
        return { href, ...update };
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: { result } };
    },
  );

  server.registerTool(
    "caldav_delete_event",
    {
      description: "Delete VEVENT resource",
      inputSchema: z.object({
        eventHref: z.string().url(),
        etag: z.string().optional(),
      }),
    },
    async (args, extra) => {
      const result = await withContext(extra, async (context) => {
        const href = normalizeHref(args.eventHref, config.CALDAV_BASE_URL);
        await client.deleteEvent(context, href, args.etag);
        return { href, deleted: true };
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: { result } };
    },
  );
}
