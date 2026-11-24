import type { Config } from "@netlify/functions";
import { getDb } from "./_lib/db.js";

export default async function handler(_req: Request): Promise<Response> {
  try {
    const db = getDb();
    const rows = await db.sql`SELECT COUNT(*)::int AS count FROM postings`;
    const count = (rows[0] as { count: number }).count;
    return Response.json({ ok: true, count });
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const config: Config = { path: "/api/health" };
