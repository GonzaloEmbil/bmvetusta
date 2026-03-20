import type { RedisStoredObject } from 'types';

// This is used to retrieve fallback data from Redis if the data is expired
// In case it is fallback data, it throws this error so the data can be retrieved
// in case the fetch failed
export class ExpiredDataAsError<T extends any = any> extends Error {
  constructor(public data: RedisStoredObject<T>) {
    super('Expired data used as Fallback');
  }
}
