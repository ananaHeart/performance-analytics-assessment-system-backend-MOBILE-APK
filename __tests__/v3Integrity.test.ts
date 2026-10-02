import {
  canonicalJson,
  contentUuidFromSha256,
  sha256Hex,
} from '../src/database/v3/integrity';

describe('V3 snapshot integrity helpers', () => {
  test('canonicalizes object keys before hashing', () => {
    const left = { b: 2, a: 1, nested: { z: true, x: null } };
    const right = { nested: { x: null, z: true }, a: 1, b: 2 };

    expect(canonicalJson(left)).toBe(
      '{"a":1,"b":2,"nested":{"x":null,"z":true}}',
    );
    expect(sha256Hex(left)).toBe(sha256Hex(right));
    expect(sha256Hex({ a: 1, b: 2 })).toBe(
      '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777',
    );
  });

  test('derives a stable canonical UUID from a SHA-256 value', () => {
    const hash = sha256Hex({ snapshot: 'same-content' });
    const uuid = contentUuidFromSha256(hash);

    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(contentUuidFromSha256(hash)).toBe(uuid);
  });

  test('rejects values that cannot be represented as contract JSON', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow('non-finite');
    expect(() => canonicalJson(() => undefined)).toThrow('function');
    expect(() => contentUuidFromSha256('not-a-hash')).toThrow('SHA-256');
  });
});
