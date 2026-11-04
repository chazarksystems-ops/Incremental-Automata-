import { describe, expect, it } from 'vitest';
import { hashWorld, sha256Hex } from '../../src/core/hash';
import { createWorld, withCell } from '../../src/core/world';

const enc = (s: string) => new TextEncoder().encode(s);

describe('sha256', () => {
  it('matches FIPS 180-4 test vectors', () => {
    expect(sha256Hex(enc(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(enc('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(enc('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('handles multi-block inputs (the size of a 128×128 board)', async () => {
    const { createHash } = await import('node:crypto');
    const data = new Uint8Array(128 * 128 + 20).map((_, i) => (i * 7919) & 0xff);
    expect(sha256Hex(data)).toBe(createHash('sha256').update(data).digest('hex'));
  });
});

describe('hashWorld', () => {
  it('distinguishes generation, size and cells', () => {
    const a = createWorld(8, 8);
    expect(hashWorld(a)).not.toBe(hashWorld(createWorld(8, 8, 1)));
    expect(hashWorld(a)).not.toBe(hashWorld(createWorld(4, 16)));
    expect(hashWorld(a)).not.toBe(hashWorld(withCell(a, 0, 0, true)));
    expect(hashWorld(a)).toBe(hashWorld(createWorld(8, 8)));
  });
});
