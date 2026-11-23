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

describe('seconds motion', () => {
  it('keeps the sweep hand in the original theme and uses the Hub orbit in the Neo theme', () => {
    expect(CLOCK_THEMES.original.secondsMotion).toBe('hand');
    expect(CLOCK_THEMES.neo.secondsMotion).toBe('orbit');
  });
});

describe('Neo clock face', () => {
  it('draws the Neo mark and no tick dashes only in the Neo theme', () => {
    expect(CLOCK_THEMES.neo.backgroundMark).toBe(true);
    expect(CLOCK_THEMES.neo.bezelTicks).toBe(false);
    expect(CLOCK_THEMES.original.backgroundMark).toBe(false);
    expect(CLOCK_THEMES.original.bezelTicks).toBe(true);
    expect(CLOCK_THEMES.neo.drawIn).toBe(true);
    expect(CLOCK_THEMES.original.drawIn).toBe(false);
  });

  it('uses the Neo office cities only in the Neo theme', () => {
    expect(CLOCK_THEMES.neo.defaultCities).toBe('neo');
    expect(CLOCK_THEMES.original.defaultCities).toBe('world');
  });
});
