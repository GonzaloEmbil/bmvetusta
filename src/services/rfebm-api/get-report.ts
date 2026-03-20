import { responseOfficialReportSchema } from 'src/schema/official-report/response';
import { rfebmApiFetch } from './core';

export async function rfebmAPIGetOfficialReport(
  groupId?: string | number,
  matchId?: string | number,
  cacheTTL = 10, // In secs
  cacheAsFallback = false,
  forceRevalidate = false,
  forceCachedDataIfTruthy = false
) {
  if (!groupId || !matchId) {
    return null;
  }

  const pathname = '/ws/acta';
  const body = new URLSearchParams();
  body.append('id_grupo', groupId.toString());
  body.append('id_partido', matchId.toString());

  return rfebmApiFetch(
    pathname,
    responseOfficialReportSchema,
    body,
    cacheTTL,
    cacheAsFallback,
    forceRevalidate,
    forceCachedDataIfTruthy
  );
}
