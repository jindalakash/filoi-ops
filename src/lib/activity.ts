import { db } from "./db";

export async function logActivity(userId: string | null, action: string, entity: string, entityId: string | null, summary: string) {
  try {
    await db.activity.create({ data: { userId, action, entity, entityId, summary } });
  } catch (e) {
    console.error("activity log failed", e);
  }
}
