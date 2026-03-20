import type { RedisStoredObject } from 'types';

export function isRedisStoredObjectExpiredData(
  data: RedisStoredObject<any> | null,
  cacheTTL: number = 86400,
  now: number = Date.now()
) {
  const { createdAt = now } = data ?? {};
  const dataTTL = Math.floor((now - createdAt) / 1000);
  const isExpired = cacheTTL > 0 && cacheTTL < Infinity && dataTTL >= cacheTTL;

  return isExpired;
}
