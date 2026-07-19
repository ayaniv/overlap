import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBooleanFlag, writeBooleanFlag } from './localStorageFlag';
import { logger } from '../logger/logger';

const KEY = 'overlap:test-flag';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('readBooleanFlag', () => {
  it('is false when nothing has been persisted', () => {
    expect(readBooleanFlag(KEY, 'test flag')).toBe(false);
  });

  it('is true once the flag has been written', () => {
    writeBooleanFlag(KEY, 'test flag');
    expect(readBooleanFlag(KEY, 'test flag')).toBe(true);
  });

  it('reports read failures through the logger rather than the console', () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('boom');
    // spy on Storage.prototype, not the window.localStorage instance: jsdom
    // backs localStorage with a Proxy, so an own-property spy on the instance
    // is silently bypassed and the failure path would never actually run
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw boom;
    });

    expect(readBooleanFlag(KEY, 'test flag')).toBe(false);
    expect(error).toHaveBeenCalledWith(boom, 'failed to read test flag state');
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('writeBooleanFlag', () => {
  it('reports write failures through the logger rather than the console', () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('boom');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw boom;
    });

    expect(() => writeBooleanFlag(KEY, 'test flag')).not.toThrow();
    expect(error).toHaveBeenCalledWith(boom, 'failed to persist test flag state');
    expect(consoleError).not.toHaveBeenCalled();
  });
});
