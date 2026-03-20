import { responseInitialSchema } from 'src/schema/initial/response';
import { rfebmApiFetch } from './core';
import { WEEK_IN_SECS } from './lib/secs';

export async function rfebmAPIGetInitialData(
  cacheTTL = WEEK_IN_SECS,
  cacheAsFallback = true,
  forceRevalidate = false,
  forceCachedDataIfTruthy = false
) {
  const pathname = '/ws/datosIniciales';
  const body = new URLSearchParams();
  body.append('id_ambito', '1');

  return rfebmApiFetch(
    pathname,
    responseInitialSchema,
    body,
    cacheTTL,
    cacheAsFallback,
    forceRevalidate,
    forceCachedDataIfTruthy
  ); // TODO: Define schema for this request
}
