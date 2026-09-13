import "server-only";
import { PrismaClient } from "@prisma/client";
import { randomBytes, timingSafeEqual } from "node:crypto";

const state = globalThis as unknown as { schedulerPrisma?: PrismaClient; schedulerWriteToken?: string };
export const db = state.schedulerPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") state.schedulerPrisma = db;
export function writeToken() { return state.schedulerWriteToken ??= randomBytes(32).toString("hex"); }
export function validWriteToken(token: string | null) {
  const expected = writeToken();
  return !!token && token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
