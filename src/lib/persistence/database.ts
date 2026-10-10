import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createDatabase, type Database } from "./client";

const state = globalThis as unknown as { schedulerDb?: Database; schedulerWriteToken?: string };
export const db = state.schedulerDb ?? createDatabase();
if (process.env.NODE_ENV !== "production") state.schedulerDb = db;
export function writeToken() { return state.schedulerWriteToken ??= randomBytes(32).toString("hex"); }
export function validWriteToken(token: string | null) {
  const expected = writeToken();
  return !!token && token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
