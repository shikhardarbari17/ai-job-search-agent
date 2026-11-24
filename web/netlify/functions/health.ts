import type { Config } from "@netlify/functions";
import { getDb } from "./_lib/db.js";

export default async function handler(_req: Request): Promise<Response> {
  const db = getDb();
  const result = await db.sql`SELECT COUNT(*)::int AS count FROM postings`;
  const count = (result.rows[0] as { count: number }).count;
  return Response.json({ ok: true, count });
}

export const config: Config = { path: "/api/health" };
