import { describe, it, expect } from 'vitest';
import { checkContent } from '../utils/profanityFilter.js';

describe('Profanity Filter', () => {
  it('should allow clean text', () => {
    const result = checkContent('This is a great track!');
    expect(result.isBlocked).toBe(false);
  });

  it('should allow moderate swearing', () => {
    // Current requirement: Allow moderate swearing
    const moderateSwear1 = checkContent('This song is fucking awesome!');
    const moderateSwear2 = checkContent('Damn, that drop was sick.');
    const moderateSwear3 = checkContent('What the hell is this?');

    expect(moderateSwear1.isBlocked).toBe(false);
    expect(moderateSwear2.isBlocked).toBe(false);
    expect(moderateSwear3.isBlocked).toBe(false);
  });

  it('should block racist slurs', () => {
    const slur1 = checkContent('You are a nigger');
    const slur2 = checkContent('Go away chink');
    const slur3 = checkContent('Stay out kike');

    expect(slur1.isBlocked).toBe(true);
    expect(slur1.message).toContain('community guidelines');
    expect(slur2.isBlocked).toBe(true);
    expect(slur3.isBlocked).toBe(true);
  });

  it('should block xenophobic/nationalistic slurs', () => {
    const slur1 = checkContent('Stupid beaner');
    const slur2 = checkContent('Dumb polack');

    expect(slur1.isBlocked).toBe(true);
    expect(slur2.isBlocked).toBe(true);
  });

  it('should block LGBTQ+ slurs', () => {
    const slur1 = checkContent('Shut up faggot');
    const slur2 = checkContent('You are a tranny');

    expect(slur1.isBlocked).toBe(true);
    expect(slur2.isBlocked).toBe(true);
  });

  it('should block ableist slurs', () => {
    const slur1 = checkContent('You are a retard');
    expect(slur1.isBlocked).toBe(true);
  });

  it('should catch evasions (leet-speak) of blocked terms', () => {
    // Obscenity with EnglishRecommendedTransformers should catch these
    const evasion1 = checkContent('n1gger');
    const evasion2 = checkContent('f@ggot');
    const evasion3 = checkContent('tr@nny');

    expect(evasion1.isBlocked).toBe(true);
    expect(evasion2.isBlocked).toBe(true);
    expect(evasion3.isBlocked).toBe(true);
  });

  it('should be case-insensitive', () => {
    const upperSlur = checkContent('NIGGER');
    const mixedSlur = checkContent('fAgGoT');

    expect(upperSlur.isBlocked).toBe(true);
    expect(mixedSlur.isBlocked).toBe(true);
  });
});
