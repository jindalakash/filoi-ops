import crypto from "crypto";

function key() {
  return crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY || "dev-key").digest();
}
export function encrypt(text: string) {
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}
export function decrypt(blob?: string | null) {
  if (!blob) return "";
  try {
    const [, iv, tag, data] = blob.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}
export function mask(secret: string) {
  if (!secret) return "";
  return secret.length <= 8 ? "••••" : `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}
