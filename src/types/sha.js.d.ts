declare module 'sha.js' {
  interface ShaDigest {
    update(data: string, encoding?: string): ShaDigest;
    digest(encoding: 'hex'): string;
  }

  function createSha(algorithm: 'sha256'): ShaDigest;

  export default createSha;
}
