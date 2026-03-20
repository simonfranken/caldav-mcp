import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

export class CaldavHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly url: string,
    public readonly body?: string,
  ) {
    super(`CalDAV request failed: ${method} ${url} -> ${status}`);
  }
}

export class ValidationError extends Error {}

export class UnauthenticatedError extends Error {}

export function mapErrorToMcp(error: unknown): McpError {
  if (error instanceof McpError) {
    return error;
  }

  if (error instanceof ValidationError) {
    return new McpError(ErrorCode.InvalidParams, error.message);
  }

  if (error instanceof UnauthenticatedError) {
    return new McpError(ErrorCode.InvalidRequest, "Unauthenticated", { status: 401 });
  }

  if (error instanceof CaldavHttpError) {
    if (error.status === 400) return new McpError(ErrorCode.InvalidParams, "Invalid request to CalDAV server", { status: 400 });
    if (error.status === 401) return new McpError(ErrorCode.InvalidRequest, "Unauthenticated", { status: 401 });
    if (error.status === 403) return new McpError(ErrorCode.InvalidRequest, "Forbidden", { status: 403 });
    if (error.status === 404) return new McpError(ErrorCode.InvalidRequest, "Resource not found", { status: 404 });
    if (error.status === 409 || error.status === 412) return new McpError(ErrorCode.InvalidRequest, "Conflict or precondition failed", { status: error.status });
    if (error.status === 422) return new McpError(ErrorCode.InvalidParams, "Unprocessable calendar data", { status: 422 });
    if (error.status === 423) return new McpError(ErrorCode.InvalidRequest, "Resource is locked", { status: 423 });
    if (error.status === 424) return new McpError(ErrorCode.InvalidRequest, "Failed dependency", { status: 424 });
    if (error.status === 507) return new McpError(ErrorCode.InternalError, "Insufficient storage on upstream", { status: 507 });
    if (error.status >= 500) return new McpError(ErrorCode.InternalError, "CalDAV upstream unavailable", { status: error.status });
    return new McpError(ErrorCode.InvalidRequest, "CalDAV request failed", { status: error.status });
  }

  if (error instanceof Error) {
    return new McpError(ErrorCode.InternalError, error.message);
  }
  return new McpError(ErrorCode.InternalError, "Unknown error");
}
