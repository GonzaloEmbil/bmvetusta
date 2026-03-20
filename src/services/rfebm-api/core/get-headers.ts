const DEFAULT_USER_AGENT = `6&"7*/5*&,?"->(1483>%1*!("%* 0''>8.38-"?",("2#,!$(1>:64?"?,#?*='")*2" =.70IOS`;

export function getRequestRFEBMApiHeaders() {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    'Connection': 'keep-alive',
    'Accept': 'application/json',
    'User-Agent': process.env.RFEBM_USER_AGENT ?? DEFAULT_USER_AGENT,
    'Accept-Language': 'es-ES;q=1.0, en-ES;q=0.9',
  };

  return headers;
}
