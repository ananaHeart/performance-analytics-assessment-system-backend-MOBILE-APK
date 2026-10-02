import { useEffect, useState } from 'react';

/**
 * fetch for every V3 backend call, made for free hosting that sleeps when idle
 * (Render Free: the first request after 15 idle minutes can take 1-2 minutes
 * while the server starts).
 *
 * - While the server is starting, the host answers 502/503/504; those are
 *   retried until the server is up (or MAX_WAIT_MS passes).
 * - A request that gets no answer within ATTEMPT_TIMEOUT_MS is sent again.
 * - A request still waiting after SLOW_REQUEST_MS is reported to listeners, so
 *   screens can say "the server is waking up" instead of looking frozen.
 *
 * A plain network failure (no connection) is NOT retried: that is the phone
 * being offline, and offline screens should fall back to local data at once.
 *
 * Re-sending is safe for every V3 call: uploads and verifications carry fixed
 * sync/operation UUIDs, so a repeat is replayed by the backend, not duplicated.
 */
const WAKING_STATUSES = new Set([502, 503, 504]);
const SLOW_REQUEST_MS = 8_000;
const ATTEMPT_TIMEOUT_MS = 120_000;
const MAX_WAIT_MS = 180_000;
const RETRY_DELAY_MS = 5_000;

type WakingListener = (waking: boolean) => void;

const listeners = new Set<WakingListener>();
let slowRequestCount = 0;

const notifyListeners = (): void => {
  const waking = slowRequestCount > 0;
  listeners.forEach(listener => listener(waking));
};

export const subscribeV3ServerWaking = (listener: WakingListener): (() => void) => {
  listeners.add(listener);
  listener(slowRequestCount > 0);
  return () => {
    listeners.delete(listener);
  };
};

/** True while any V3 request has been waiting long enough to suggest a cold start. */
export const useV3ServerWaking = (): boolean => {
  const [waking, setWaking] = useState(false);
  useEffect(() => subscribeV3ServerWaking(setWaking), []);
  return waking;
};

export const V3_SERVER_WAKING_MESSAGE =
  'Connecting to the server... It may be waking up after being idle, which can take 1-2 minutes. Please wait.';

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const isAbort = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

export const v3Fetch = async (input: string, init?: RequestInit): Promise<Response> => {
  const startedAt = Date.now();
  let reportedSlow = false;
  const reportSlow = () => {
    if (reportedSlow) return;
    reportedSlow = true;
    slowRequestCount += 1;
    notifyListeners();
  };
  const slowTimer = setTimeout(reportSlow, SLOW_REQUEST_MS);

  try {
    for (;;) {
      const controller = new AbortController();
      const attemptTimer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
      try {
        const response = await fetch(input, { ...init, signal: controller.signal });
        if (!WAKING_STATUSES.has(response.status) || Date.now() - startedAt >= MAX_WAIT_MS) {
          return response;
        }
      } catch (error) {
        if (!isAbort(error)) throw error;
        if (Date.now() - startedAt >= MAX_WAIT_MS) {
          throw new Error('The server did not respond in time. Check the connection and try again.');
        }
      } finally {
        clearTimeout(attemptTimer);
      }
      reportSlow();
      await delay(RETRY_DELAY_MS);
    }
  } finally {
    clearTimeout(slowTimer);
    if (reportedSlow) {
      slowRequestCount -= 1;
      notifyListeners();
    }
  }
};
