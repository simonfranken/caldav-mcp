import { randomUUID } from "node:crypto";

export function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) {
      continue;
    }
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
  return undefined;
}

export function getCorrelationId(headers: Record<string, string | string[] | undefined>): string {
  return getHeader(headers, "x-request-id") ?? randomUUID();
}

export function normalizeHref(href: string, baseUrl: string): string {
  const normalized = new URL(href, baseUrl);
  normalized.hash = "";
  return normalized.toString();
}

export function normalizeIdFromHref(href: string): string {
  const url = new URL(href);
  const trimmed = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  return decodeURIComponent(trimmed.split("/").filter(Boolean).at(-1) ?? "");
}

export function joinUrl(baseHref: string, child: string): string {
  return new URL(child, baseHref).toString();
}
