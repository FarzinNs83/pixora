import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { createZip, uniqueFileName } from './archive';

describe('download-all archives', () => {
  it('keeps duplicate output names without replacing a file', async () => {
    const blob = await createZip([
      { name: 'photo.png', bytes: new Uint8Array([1, 2]) },
      { name: 'photo.png', bytes: new Uint8Array([3, 4]) },
    ]);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect([...files['photo.png']]).toEqual([1, 2]);
    expect([...files['photo-2.png']]).toEqual([3, 4]);
  });

  it('preserves names without an extension', () => {
    expect(uniqueFileName('clip', new Set(['clip']))).toBe('clip-2');
  });
});
