import { z } from 'zod';
import { rfebmApiFetch } from './core';
import { DAY_IN_SECS } from './lib/secs';

export async function rfebmApiGetClub(
  clubId: string | number,
  ambitoId: string | number = 13,
  cacheTTL = DAY_IN_SECS,
  cacheAsFallback = false,
  forceRevalidate = false,
  forceCachedDataIfTruthy = false
) {
  if (!clubId) {
    return null;
  }

  const pathname = '/ws/infoClub';
  const body = new URLSearchParams();
  body.append('idClub', clubId.toString());
  body.append('id_ambito', ambitoId.toString());

  return rfebmApiFetch(
    pathname,
    z.any(),
    body,
    cacheTTL,
    cacheAsFallback,
    forceRevalidate,
    forceCachedDataIfTruthy
  ); // TODO: Create a schema for the response
}
