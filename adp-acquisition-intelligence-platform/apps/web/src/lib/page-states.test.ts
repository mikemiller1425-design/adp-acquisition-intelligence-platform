import { describe, expect, it } from 'vitest';

import {
  presentationMessage,
  presentationTitle,
  resolvePresentationFromData,
} from '@/lib/page-states';

describe('page presentation states', () => {
  it('prefers explicit presentation state', () => {
    expect(
      resolvePresentationFromData({
        explicit: 'loading',
        denied: true,
        isEmpty: true,
      }),
    ).toBe('loading');
  });

  it('falls back to denied, error, then empty', () => {
    expect(resolvePresentationFromData({ explicit: null, denied: true })).toBe('denied');
    expect(resolvePresentationFromData({ explicit: null, errorMessage: 'boom' })).toBe('error');
    expect(resolvePresentationFromData({ explicit: null, isEmpty: true })).toBe('empty');
    expect(resolvePresentationFromData({ explicit: null })).toBe('ready');
  });

  it('provides accessible titles and messages', () => {
    expect(presentationTitle('denied')).toBe('Access denied');
    expect(presentationMessage('empty', 'prospects')).toContain('prospects');
    expect(presentationMessage('error', 'dashboard')).toContain('dashboard');
  });
});
