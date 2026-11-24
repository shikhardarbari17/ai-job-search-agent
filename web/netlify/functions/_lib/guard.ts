import { createHash, timingSafeEqual } from "node:crypto";

export function guardPasscode(req: Request): Response | null {
  const header = req.headers.get("x-admin-passcode") ?? "";
  const expected = process.env.ADMIN_PASSCODE ?? "";

  if (!expected) {
    return new Response(JSON.stringify({ error: "Server misconfigured: ADMIN_PASSCODE not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(expected).digest();

  if (!timingSafeEqual(a, b)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}
