import { describe, expect, it } from 'vitest';

import { isMemoryFailure } from './ffmpeg-service';

describe('video engine recovery', () => {
  it('recognizes both reported WebAssembly failure messages', () => {
    expect(isMemoryFailure('RuntimeError: memory access out of bounds')).toBe(true);
    expect(isMemoryFailure(new TypeError("Cannot read properties of undefined (reading 'startsWith')"))).toBe(true);
    expect(isMemoryFailure('Invalid data found when processing input')).toBe(false);
  });
});
