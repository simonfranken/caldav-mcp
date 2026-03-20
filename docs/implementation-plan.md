# CalDAV MCP Server - Final Implementation Plan (v2)

## 1) Objectives

- Provide an MCP server (Streamable HTTP) for one configured CalDAV host.
- Use pass-through authentication from MCP client to CalDAV upstream.
- Resolve principal dynamically per authenticated caller.
- Support calendar and event CRUD against SOGo-compatible CalDAV.
- Handle multiple calendars visible under a principal (including shared/read-only calendars).

## 2) Scope (v1)

### In

- Principal discovery (`current-user-principal`, `calendar-home-set`)
- Calendar CRUD (list/create/update/delete; update/create gated by server capability)
- Event CRUD (`VEVENT`): list/get/create/update/delete
- Conditional requests with ETag
- Structured error mapping from HTTP/WebDAV to MCP errors
- Streamable HTTP support

### Out (v1)

- Scheduling workflow (iTIP)
- Full incremental sync (`sync-token`) unless server capability is confirmed
- Advanced recurrence expansion server-side
- Multi-host routing

## 3) Principal and Auth Strategy

- Configure host: `<your-caldav-base-url>`
- Do not hardcode principal identity; resolve dynamically for each authenticated request.
- Per request:
  1. Forward allowlisted auth headers (`Authorization`; optional `Cookie` behind config)
  2. Resolve principal dynamically using `PROPFIND current-user-principal`
  3. Resolve `calendar-home-set` from principal
- Security:
  - Never persist credentials
  - Redact auth in logs
  - Reject upstream host override
  - TLS verification on by default

## 4) Transport and Runtime

- TypeScript + Node.js MCP SDK
- Streamable HTTP endpoint: `POST /mcp`
- Health endpoint: `GET /healthz`
- Request correlation ID across MCP + CalDAV calls
- Request-scoped auth context only (no cross-request leakage)

## 5) MCP Tools (v1)

1. `caldav_discover_principal`
2. `caldav_list_calendars`
3. `caldav_create_calendar` (if supported)
4. `caldav_update_calendar` (if supported)
5. `caldav_delete_calendar`
6. `caldav_list_events` (time-range bounded)
7. `caldav_get_event`
8. `caldav_create_event`
9. `caldav_update_event`
10. `caldav_delete_event`

Tool outputs include `href`, `etag`, and normalized identifiers.

## 6) Protocol Mapping

- Discovery/list: `PROPFIND` (`Depth: 0/1`)
- Event query: `REPORT calendar-query` with `time-range`
- Read object: `GET`
- Create/update object: `PUT text/calendar`
- Delete object/calendar: `DELETE`
- Create calendar: `MKCALENDAR`
- Update calendar props: `PROPPATCH`

Implementation rules:

- Parse `207 Multi-Status` per-resource
- Normalize hrefs to absolute canonical URLs
- Use `If-Match` for updates/deletes where possible

## 7) Data and Validation Rules

- Support raw ICS input/output for fidelity
- Optional structured event input converted to ICS
- Validate:
  - UID presence (generate if absent on create)
  - DTSTART/DTEND consistency
  - Timezone references (`VTIMEZONE` preservation)
- Deterministic event href strategy from UID (configurable)

## 8) Error Model

Map to MCP errors with safe diagnostics:

- 400 invalid input
- 401 unauthenticated
- 403 forbidden
- 404 not found
- 409/412 conflict/precondition
- 422 unprocessable calendar data
- 423 locked
- 424 failed dependency
- 507 insufficient storage
- 5xx upstream unavailable

## 9) Configuration

- `CALDAV_BASE_URL`
- `MCP_HTTP_PORT`
- `LOG_LEVEL`
- `ALLOW_COOKIE_PASSTHROUGH=false`
- `CALDAV_TIMEOUT_MS`
- `CALDAV_RETRY_COUNT` (idempotent ops only)

## 10) Delivery Phases

1. Bootstrap server + config + logging + health
2. WebDAV core client + XML parser/builder + capability probe
3. Principal discovery + calendar listing
4. Calendar CRUD (capability-gated)
5. Event CRUD + ETag conflict controls
6. Hardening: error mapping, redaction, timeout/retry, large-query handling
7. Tests + docs + runbook

## 11) Testing

- Unit: XML parsing, URL normalization, ETag logic, error mapping
- Integration:
  - Auth pass-through success/failure
  - Multi-calendar discovery from principal
  - Event CRUD roundtrip with conflict test
  - Read-only/shared calendar write rejection
- Contract: MCP tool schemas/responses
- Smoke: discover -> list calendars -> create/update/delete event

## 12) Definition of Done

- Streamable MCP endpoint stable
- Pass-through auth verified against target SOGo host
- Multiple calendars discoverable and usable
- Calendar + VEVENT CRUD works with conflict handling
- Errors/logging secure and actionable
- Documentation sufficient for deploy and troubleshooting
