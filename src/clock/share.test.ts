import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyShareLink, shareLink } from './share';

afterEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE_HREF = 'https://overlap.vercel.app/#c=abc123';

describe('copyShareLink', () => {
  it('writes the href to the clipboard and returns true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyShareLink({ writeText }, SAMPLE_HREF)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(SAMPLE_HREF);
  });

  it('returns false and logs an error when the clipboard write rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    await expect(copyShareLink({ writeText }, SAMPLE_HREF)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('returns false and logs an error when the clipboard write throws synchronously', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const writeText = vi.fn().mockImplementation(() => {
      throw new Error('clipboard unavailable');
    });
    await expect(copyShareLink({ writeText }, SAMPLE_HREF)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('shareLink', () => {
  it('uses navigator.share when available and returns "shared" without touching the clipboard', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    await expect(shareLink({ share }, { writeText }, SAMPLE_HREF)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ url: SAMPLE_HREF });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('returns "cancelled" without logging or copying when the user dismisses the share sheet', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const share = vi.fn().mockRejectedValue(abortError);
    const writeText = vi.fn();
    await expect(shareLink({ share }, { writeText }, SAMPLE_HREF)).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard and returns "copied" when navigator.share fails for a non-cancel reason', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const share = vi.fn().mockRejectedValue(new Error('share target failed'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(shareLink({ share }, { writeText }, SAMPLE_HREF)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(SAMPLE_HREF);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to the clipboard and returns "failed" when both navigator.share and the clipboard fail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const share = vi.fn().mockRejectedValue(new Error('share target failed'));
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    await expect(shareLink({ share }, { writeText }, SAMPLE_HREF)).resolves.toBe('failed');
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('copies directly when navigator.share is not supported', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(shareLink({}, { writeText }, SAMPLE_HREF)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(SAMPLE_HREF);
  });
});
