import { createHmac } from "node:crypto";

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function makeSession(email: string, secret: string): string {
  const payload = Buffer.from(email).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readSession(cookie: string | undefined, secret: string): string | null {
  if (!cookie) return null;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return null;
  if (sign(payload, secret) !== sig) return null;
  return Buffer.from(payload, "base64url").toString();
}
