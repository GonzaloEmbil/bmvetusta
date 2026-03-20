import { requestWithOptionalProxy } from 'src/lib/request-with-optional-proxy';
import { type z } from 'zod';
import { getRequestRFEBMApiHeaders } from './get-headers';

export async function requestRFEBMApiData<T extends z.ZodType | z.ZodEffects<z.ZodType> = z.ZodAny>(
  url: URL,
  schema: T,
  body?: URLSearchParams
): Promise<z.output<T> | null> {
  const headers = getRequestRFEBMApiHeaders();

  return requestWithOptionalProxy(
    url,
    schema,
    process.env.PROXY_URL,
    {
      headers,
      method: 'POST',
    },
    body
  ).catch((e) => {
    console.error('Error while fetching the data', e);
    return null;
  });
}
