import createSha from 'sha.js';

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot hash a non-finite number.');
    }
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const entries = Object.keys(object)
      .filter(key => object[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalize(object[key])}`);
    return `{${entries.join(',')}}`;
  }

  throw new Error(`Cannot hash value of type ${typeof value}.`);
};

export const canonicalJson = (value: unknown): string => canonicalize(value);

export const sha256Hex = (value: unknown): string =>
  createSha('sha256').update(canonicalJson(value), 'utf8').digest('hex');

export const contentUuidFromSha256 = (hash: string): string => {
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error('Snapshot hash must be a lowercase SHA-256 value.');
  }

  const characters = hash.slice(0, 32).split('');
  characters[12] = '5';
  characters[16] = ((Number.parseInt(characters[16], 16) % 4) + 8).toString(16);
  const value = characters.join('');

  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(
    12,
    16,
  )}-${value.slice(16, 20)}-${value.slice(20)}`;
};
