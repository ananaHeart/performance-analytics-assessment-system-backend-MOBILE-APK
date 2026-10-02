import { subscribeV3ServerWaking, v3Fetch } from '../src/services/v3/coldStartFetch';

const response = (status: number) => ({ status } as Response);

describe('v3Fetch (sleeping free hosting)', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock.mockReset();
    (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('retries while the host answers 503 and reports the server as waking', async () => {
    fetchMock
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(502))
      .mockResolvedValueOnce(response(200));
    const states: boolean[] = [];
    const unsubscribe = subscribeV3ServerWaking(waking => states.push(waking));

    const pending = v3Fetch('https://example.test/api', { method: 'POST', body: 'x' });
    await jest.advanceTimersByTimeAsync(15_000);

    await expect(pending).resolves.toEqual(response(200));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Same request every time: the body and method are re-sent unchanged.
    fetchMock.mock.calls.forEach(([url, init]) => {
      expect(url).toBe('https://example.test/api');
      expect(init).toMatchObject({ method: 'POST', body: 'x' });
    });
    expect(states).toEqual([false, true, false]);
    unsubscribe();
  });

  test('does not retry a network failure, so offline screens fall back at once', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(v3Fetch('https://example.test/api')).rejects.toThrow('Network request failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('returns ordinary error responses unchanged', async () => {
    fetchMock.mockResolvedValueOnce(response(401));

    await expect(v3Fetch('https://example.test/api')).resolves.toEqual(response(401));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('gives up with the last response after the maximum wait', async () => {
    fetchMock.mockResolvedValue(response(503));

    const pending = v3Fetch('https://example.test/api');
    await jest.advanceTimersByTimeAsync(200_000);

    await expect(pending).resolves.toEqual(response(503));
  });
});
