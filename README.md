# caldav-mcp

CalDAV MCP server (Streamable HTTP) with per-request auth pass-through and dynamic principal discovery.

## Features

- Streamable MCP endpoint at `POST /mcp`
- Health endpoint at `GET /healthz`
- Dynamic discovery via `current-user-principal` and `calendar-home-set`
- Calendar tools: list/create/update/delete (create/update capability-gated)
- Event tools: list/get/create/update/delete with ETag conditional controls
- Structured HTTP/WebDAV error mapping into MCP-safe errors
- Request correlation IDs with auth header redaction in logs

## Configuration

Environment variables:

- `CALDAV_BASE_URL` (required, no default)
- `MCP_HTTP_PORT` (default: `3000`)
- `LOG_LEVEL` (`debug|info|warn|error`, default: `info`)
- `ALLOW_COOKIE_PASSTHROUGH` (`true|false`, default: `false`)
- `CALDAV_TIMEOUT_MS` (default: `15000`)
- `CALDAV_RETRY_COUNT` (idempotent ops only, default: `1`)
- `EVENT_HREF_STRATEGY` (default: `uid`)

Copy `.env.template` to `.env` and fill in your CalDAV host before starting.

## Run

```bash
npm install
npm run dev
```

Build and test:

```bash
npm run build
npm test
```

## Docker

Build the image:

```bash
docker build -t caldav-mcp .
```

Run the container:

```bash
docker run --rm -p 3000:3000 --env-file .env caldav-mcp
```

The server listens on port `3000` in the container.

## MCP Tools

- `caldav_discover_principal`
- `caldav_list_calendars`
- `caldav_create_calendar`
- `caldav_update_calendar`
- `caldav_delete_calendar`
- `caldav_list_events`
- `caldav_get_event`
- `caldav_create_event`
- `caldav_update_event`
- `caldav_delete_event`

## Notes

- Upstream host override is not supported; all requests target configured `CALDAV_BASE_URL`.
- `Authorization` is required on incoming MCP requests and forwarded upstream.
- `Cookie` forwarding is disabled unless `ALLOW_COOKIE_PASSTHROUGH=true`.
- Credentials are never persisted and are redacted from logs.
