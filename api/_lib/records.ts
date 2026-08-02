import { redis } from './redis';

// A record that is pushed to / pulled from the cloud. `deleted` marks a tombstone.
export interface SyncRecord {
  module: string;
  id: string;
  data: unknown;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

const key = (userId: string) => `user:${userId}:records`;
const field = (r: { module: string; id: string }) => `${r.module}:${r.id}`;

/** Merge a batch of records for a user. Returns the full, canonical record set. */
export async function putRecords(userId: string, records: SyncRecord[]): Promise<SyncRecord[]> {
  if (records.length) {
    const pipe = redis.pipeline();
    for (const r of records) {
      pipe.hset(key(userId), { [field(r)]: JSON.stringify(r) });
    }
    await pipe.exec();
  }
  return getAll(userId);
}

/**
 * Fetch records for a user. If `since` is provided, only records changed after
 * that timestamp are returned (incremental pull) — this keeps command usage low.
 */
export async function getAll(userId: string, since?: number): Promise<SyncRecord[]> {
  const map = await redis.hgetall(key(userId));
  if (!map) return [];
  const records = Object.values(map)
    .filter((v) => typeof v === 'string')
    .map((v) => {
      try {
        return JSON.parse(v as string) as SyncRecord;
      } catch {
        return null;
      }
    })
    .filter((v): v is SyncRecord => !!v);
  if (typeof since === 'number') {
    return records.filter((r) => r.updatedAt > since);
  }
  return records;
}
