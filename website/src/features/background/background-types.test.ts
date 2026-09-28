import { describe, expect, it } from 'vitest';

import { backgroundOutputName, prepareU2NetTensor } from './background-types';

describe('background removal helpers', () => {
  it('creates a PNG output name', () => {
    expect(backgroundOutputName('portrait.final.JPG')).toBe('portrait.final-no-background.png');
  });

  it('creates a channel-first normalized tensor', () => {
    const tensor = prepareU2NetTensor(new Uint8ClampedArray([255, 0, 127, 255, 0, 255, 255, 255]));
    expect(tensor).toHaveLength(6);
    expect(tensor[0]).toBeCloseTo((1 - 0.485) / 0.229);
    expect(tensor[2]).toBeCloseTo((0 - 0.456) / 0.224);
    expect(tensor[4]).toBeCloseTo((127 / 255 - 0.406) / 0.225);
  });
});
