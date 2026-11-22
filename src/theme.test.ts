import { describe, expect, it } from 'vitest';
import { CLOCK_THEMES, themeName } from './theme';

describe('themeName', () => {
  it('selects the Neo theme only for VITE_THEME=neo', () => {
    expect(themeName('neo')).toBe('neo');
    expect(themeName(undefined)).toBe('original');
    expect(themeName('')).toBe('original');
    expect(themeName('Neo')).toBe('original');
  });
});

describe('CLOCK_THEMES', () => {
  it('keeps each location color in the original theme', () => {
    expect(CLOCK_THEMES.original.ringColor).toBeUndefined();
  });

  it('glows only in-hours rings in the Neo theme', () => {
    expect(CLOCK_THEMES.neo.ringGlowOnlyInHours).toBe(true);
    expect(CLOCK_THEMES.original.ringGlowOnlyInHours).toBe(false);
  });
});
