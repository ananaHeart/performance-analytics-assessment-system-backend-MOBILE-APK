interface CryptoLike {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
}

const formatUuidBytes = (bytes: Uint8Array): string => {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
};

export const createV2Uuid = (): string => {
  const crypto = (globalThis as {crypto?: CryptoLike}).crypto;

  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
    return formatUuidBytes(bytes);
  }

  // React Native environments without Web Crypto still need stable offline IDs.
  let seed = Date.now() ^ Math.floor(Math.random() * 0x7fffffff);
  for (let index = 0; index < bytes.length; index += 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    bytes[index] = (seed ^ Math.floor(Math.random() * 256)) & 0xff;
  }

  return formatUuidBytes(bytes);
};
