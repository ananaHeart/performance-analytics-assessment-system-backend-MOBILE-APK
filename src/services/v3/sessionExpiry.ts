/**
 * SES-1: the backend ends a session after 5 minutes of inactivity and answers
 * the next request with HTTP 401 (code SESSION_IDLE_EXPIRED, or any other
 * auth failure). Every V3 HTTP client error carries the HTTP status, so a 401
 * from any of them means "sign in again", never "the data is bad".
 */
export const isV3SessionExpired = (error: unknown): boolean =>
  typeof error === 'object'
  && error !== null
  && 'status' in error
  && (error as {status: unknown}).status === 401;
