import { responsePreviousSchema } from 'src/schema/previous/response';
import { rfebmApiFetch } from './core';
import { DAY_IN_SECS } from './lib/secs';

export async function rfebmAPIGetPreviousData(
  matchId?: string | number,
  cacheTTL: number = DAY_IN_SECS,
  cacheAsFallback = true,
  forceRevalidate = false,
  forceCachedDataIfTruthy = false
) {
  if (!matchId) {
    console.error('No matchId for previous data');
    return null;
  }

  const pathname = '/ws/previo';
  const body = new URLSearchParams();
  body.append('id_partido', matchId.toString());

  return rfebmApiFetch(
    pathname,
    responsePreviousSchema,
    body,
    cacheTTL,
    cacheAsFallback,
    forceRevalidate,
    forceCachedDataIfTruthy
  );
}
