import { describe, expect, it } from 'vitest';

import { classifySource, validateOptions } from '../src/tools/shared.js';

describe('classifySource', () => {
  it('classifies absolute local paths as local', () => {
    expect(classifySource('/Users/me/song.mp3')).toEqual({
      kind: 'local',
      value: '/Users/me/song.mp3',
    });
  });

  it('classifies ~ paths as local (not expanded here)', () => {
    expect(classifySource('~/Music/song.wav').kind).toBe('local');
  });

  it('classifies https URLs as url', () => {
    expect(classifySource('https://cdn.example.com/audio.mp3')).toEqual({
      kind: 'url',
      value: 'https://cdn.example.com/audio.mp3',
    });
  });

  it('rejects YouTube watch URLs', () => {
    expect(() => classifySource('https://www.youtube.com/watch?v=abc')).toThrow(
      /separate_youtube/,
    );
  });

  it('rejects youtu.be short URLs', () => {
    expect(() => classifySource('https://youtu.be/abc123XYZ')).toThrow(/separate_youtube/);
  });

  it('rejects m.youtube.com URLs', () => {
    expect(() => classifySource('https://m.youtube.com/watch?v=abc')).toThrow(/separate_youtube/);
  });

  it('rejects youtube-nocookie.com URLs', () => {
    expect(() =>
      classifySource('https://www.youtube-nocookie.com/embed/abc'),
    ).toThrow(/separate_youtube/);
  });

  it('throws for empty source', () => {
    expect(() => classifySource('   ')).toThrow(/source is empty/);
  });

  it('throws for malformed URLs', () => {
    expect(() => classifySource('https://')).toThrow();
  });
});

describe('validateOptions', () => {
  it('rejects SIX_STEMS without BEST quality', () => {
    expect(() =>
      validateOptions({ outputType: 'SIX_STEMS', quality: 'FAST', outputFormat: 'MP3' }),
    ).toThrow(/SIX_STEMS requires quality=BEST/);
  });

  it('allows SIX_STEMS with BEST quality', () => {
    expect(() =>
      validateOptions({ outputType: 'SIX_STEMS', quality: 'BEST', outputFormat: 'MP3' }),
    ).not.toThrow();
  });

  it('allows other output types with any quality', () => {
    expect(() =>
      validateOptions({ outputType: 'FOUR_STEMS', quality: 'FAST', outputFormat: 'WAV' }),
    ).not.toThrow();
  });

  it('passes with all-undefined options', () => {
    expect(() => validateOptions({})).not.toThrow();
  });
});
