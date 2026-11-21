import { describe, it, expect } from 'vitest';
import {
  buildTimestampFilename,
  computeCoverCrop,
  sanitizeFilename,
} from '../photoCapture.js';

describe('photoCapture', () => {
  it('computes object-fit cover crop boxes for wider, taller, and matching sources', () => {
    // Source wider than 16:9 (e.g. 1920x960 = 2:1)
    expect(computeCoverCrop(1920, 960, 16 / 9)).toEqual({
      sx: (1920 - 960 * (16 / 9)) / 2,
      sy: 0,
      sw: 960 * (16 / 9),
      sh: 960,
    });

    // Source taller than 16:9 (e.g. 800x800 = 1:1)
    expect(computeCoverCrop(800, 800, 16 / 9)).toEqual({
      sx: 0,
      sy: (800 - 800 / (16 / 9)) / 2,
      sw: 800,
      sh: 800 / (16 / 9),
    });

    // Matching aspect ratio
    expect(computeCoverCrop(1280, 720, 16 / 9)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1280,
      sh: 720,
    });
  });

  it('sanitizes filenames by removing unsafe characters, collapsing spaces, and truncating', () => {
    expect(sanitizeFilename('  My: Filter* <v1>\u0007  ')).toBe('My-Filter-v1');
    expect(sanitizeFilename('   ///???   ')).toBe('my-aura-filter');
    expect(sanitizeFilename('a'.repeat(80))).toHaveLength(60);
  });

  it('builds ISO-safe timestamped filenames', () => {
    const fixedDate = new Date('2026-11-21T07:30:00.123Z');
    expect(buildTimestampFilename('iqra-aura', 'jpg', fixedDate)).toBe(
      'iqra-aura-2026-11-21T07-30-00-123Z.jpg',
    );
  });
});
