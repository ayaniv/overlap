import { describe, expect, it } from 'vitest';
import { isNeoMarkLit } from './neoMarkLit';

const ring = (timezoneId: string, inHours: boolean) => ({ location: { timezoneId }, inHours });

describe('isNeoMarkLit', () => {
  it('lights while Tel Aviv and Boston are both in working hours', () => {
    expect(isNeoMarkLit([ring('Asia/Jerusalem', true), ring('America/New_York', true)])).toBe(true);
  });

  it('stays dark while only one office works', () => {
    expect(isNeoMarkLit([ring('Asia/Jerusalem', true), ring('America/New_York', false)])).toBe(false);
    expect(isNeoMarkLit([ring('Asia/Jerusalem', false), ring('America/New_York', true)])).toBe(false);
  });

  it('counts any working ring in the zone, such as Washington DC', () => {
    expect(isNeoMarkLit([ring('Asia/Jerusalem', true), ring('America/New_York', false), ring('America/New_York', true)])).toBe(true);
  });

  it('stays dark when an office zone is not on the clock', () => {
    expect(isNeoMarkLit([ring('Asia/Jerusalem', true), ring('Europe/London', true)])).toBe(false);
  });
});
