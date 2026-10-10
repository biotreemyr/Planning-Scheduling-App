import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/persistence/schema.ts",
  out: "./drizzle",
  // Prisma's migration log, kept on databases that predate Drizzle; not ours to manage.
  tablesFilter: ["!_prisma_migrations"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "" }
});
