import { responseWeeksSchema } from '../../schema/weeks/response';
import { rfebmApiFetch } from './core';
import { DAY_IN_SECS } from './lib/secs';

export async function rfebmAPIGetWeeks(
  groupId?: string | number,
  cacheTTL = DAY_IN_SECS,
  cacheAsFallback = false,
  forceRevalidate = false,
  forceCachedDataIfTruthy = false
) {
  if (!groupId) {
    return null;
  }

  const pathname = '/ws/jornadas';
  const body = new URLSearchParams();
  body.append('id_grupo', groupId.toString());

  const responseData = rfebmApiFetch(
    pathname,
    responseWeeksSchema,
    body,
    cacheTTL,
    cacheAsFallback,
    forceRevalidate,
    forceCachedDataIfTruthy
  );

  return responseData;
}
