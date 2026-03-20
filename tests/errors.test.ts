import { describe, expect, it } from "vitest";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { CaldavHttpError, mapErrorToMcp } from "../src/errors.js";

describe("mapErrorToMcp", () => {
  it("maps 412 to invalid request conflict", () => {
    const error = mapErrorToMcp(new CaldavHttpError(412, "PUT", "https://example.com", ""));
    expect(error.code).toBe(ErrorCode.InvalidRequest);
    expect(error.message.toLowerCase()).toContain("conflict");
  });

  it("maps 5xx to internal error", () => {
    const error = mapErrorToMcp(new CaldavHttpError(503, "PROPFIND", "https://example.com", ""));
    expect(error.code).toBe(ErrorCode.InternalError);
  });
});
