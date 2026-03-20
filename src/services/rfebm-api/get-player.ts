import { responsePlayerSchema } from 'src/schema/player/response';
import { rfebmApiFetch } from './core';
import { DAY_IN_SECS } from './lib/secs';

export async function rfebmAPIGetPlayer(
  playerId?: string | number,
  cacheTTL = DAY_IN_SECS,
  cacheAsFallback = false,
  forceRevalidate = false,
  forceCachedDataIfTruthy = false
) {
  if (!playerId) {
    return null;
  }

  const pathname = '/ws/jugador';
  const body = new URLSearchParams();
  body.append('id_jugador', playerId.toString());

  return rfebmApiFetch(
    pathname,
    responsePlayerSchema,
    body,
    cacheTTL,
    cacheAsFallback,
    forceRevalidate,
    forceCachedDataIfTruthy
  ); // TODO: Define schema for this request
}
