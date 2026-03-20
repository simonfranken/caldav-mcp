import "dotenv/config";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CaldavClient } from "./caldav/client.js";
import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { registerTools } from "./tools.js";

const config = loadConfig();
const logger = new Logger(config.LOG_LEVEL);

function buildMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "caldav-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: { listChanged: false },
        logging: {},
      },
      instructions:
        "CalDAV MCP server with auth pass-through. Provide Authorization header from MCP client request.",
    },
  );

  const client = new CaldavClient(config, logger);
  registerTools(server, { client, config, logger });
  return server;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  const correlationId = req.headers["x-request-id"] ?? randomUUID();
  logger.info("Incoming MCP request", { correlationId, path: url.pathname, method: req.method, headers: req.headers });

  let parsedBody: unknown;
  try {
    parsedBody = await readJsonBody(req);
  } catch (error) {
    logger.warn("Invalid JSON body", { correlationId, error: error instanceof Error ? error.message : String(error) });
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      }),
    );
    return;
  }

  const mcpServer = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    logger.error("MCP transport error", { correlationId, error: error instanceof Error ? error.message : String(error) });
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        }),
      );
    }
  } finally {
    await transport.close().catch(() => undefined);
    await mcpServer.close().catch(() => undefined);
  }
});

server.listen(config.MCP_HTTP_PORT, () => {
  logger.info("caldav-mcp listening", {
    port: config.MCP_HTTP_PORT,
    baseUrl: config.CALDAV_BASE_URL,
  });
});

async function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}
