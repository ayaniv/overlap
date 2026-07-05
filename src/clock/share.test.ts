import { describe, expect, it, vi } from 'vitest';
import { copyShareLink } from './share';

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
    errorSpy.mockRestore();
  });

  it('returns false and logs an error when the clipboard write throws synchronously', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const writeText = vi.fn().mockImplementation(() => {
      throw new Error('clipboard unavailable');
    });
    await expect(copyShareLink({ writeText }, SAMPLE_HREF)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
