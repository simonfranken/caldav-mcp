import { randomUUID } from "node:crypto";
import { ValidationError } from "./errors.js";

export interface EventInput {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  dtstart: string;
  dtend?: string;
  timezone?: string;
}

export function ensureUid(ics: string): { ics: string; uid: string } {
  const existing = extractIcsField(ics, "UID");
  if (existing) {
    return { ics, uid: existing };
  }
  const uid = randomUUID();
  const injected = ics.replace("BEGIN:VEVENT", `BEGIN:VEVENT\nUID:${uid}`);
  return { ics: injected, uid };
}

export function validateIcsEvent(ics: string): void {
  const uid = extractIcsField(ics, "UID");
  if (!uid) {
    throw new ValidationError("UID is required for VEVENT");
  }

  const dtstart = extractIcsField(ics, "DTSTART");
  const dtend = extractIcsField(ics, "DTEND");
  if (!dtstart) {
    throw new ValidationError("DTSTART is required for VEVENT");
  }

  if (dtend && normalizeDate(dtend) < normalizeDate(dtstart)) {
    throw new ValidationError("DTEND must be equal or after DTSTART");
  }
}

export function buildIcsFromStructured(input: EventInput): string {
  const uid = input.uid ?? randomUUID();
  if (input.dtend && normalizeDate(input.dtend) < normalizeDate(input.dtstart)) {
    throw new ValidationError("DTEND must be equal or after DTSTART");
  }

  const dtstartLine = input.timezone ? `DTSTART;TZID=${input.timezone}:${input.dtstart}` : `DTSTART:${input.dtstart}`;
  const dtendLine = input.dtend
    ? input.timezone
      ? `DTEND;TZID=${input.timezone}:${input.dtend}`
      : `DTEND:${input.dtend}`
    : undefined;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//caldav-mcp//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    dtstartLine,
    dtendLine,
    input.summary ? `SUMMARY:${escapeText(input.summary)}` : undefined,
    input.description ? `DESCRIPTION:${escapeText(input.description)}` : undefined,
    input.location ? `LOCATION:${escapeText(input.location)}` : undefined,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => Boolean(line));

  return `${lines.join("\r\n")}\r\n`;
}

export function extractIcsField(ics: string, key: string): string | undefined {
  const lines = unfoldIcsLines(ics);
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (!upper.startsWith(`${key.toUpperCase()}:`) && !upper.startsWith(`${key.toUpperCase()};`)) {
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) {
      continue;
    }
    return line.slice(idx + 1).trim();
  }
  return undefined;
}

function unfoldIcsLines(ics: string): string[] {
  const raw = ics.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && output.length > 0) {
      output[output.length - 1] += line.slice(1);
    } else {
      output.push(line);
    }
  }
  return output;
}

function normalizeDate(value: string): string {
  return value.replace(/[-:]/g, "");
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
