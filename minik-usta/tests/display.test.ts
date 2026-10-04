import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../src/config/display';

describe('display config', () => {
  it('uses a 1080x1920 portrait design resolution', () => {
    expect(DESIGN_WIDTH).toBe(1080);
    expect(DESIGN_HEIGHT).toBe(1920);
  });
});
