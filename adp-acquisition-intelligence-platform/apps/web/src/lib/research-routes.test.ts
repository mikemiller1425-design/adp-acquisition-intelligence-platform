import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from './nav';

const REQUIRED = [
  '/research',
  '/research/population-sources',
  '/research/extraction-review',
  '/research/sources',
];

describe('phase 1.1 research routes in nav', () => {
  it('exposes research population surfaces', () => {
    for (const href of REQUIRED) {
      expect(NAV_ITEMS.some((item) => item.href === href)).toBe(true);
    }
  });
});
