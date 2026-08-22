import { describe, expect, it } from 'vitest';
import variables from '../variables.css?raw';
import globals from '../globals.css?raw';

describe('Mathopoly visual foundation', () => {
  it('defines accessible game tokens without remote font requests', () => {
    expect(variables).toContain('--action-min-height: 44px');
    expect(variables).toContain('--focus-ring:');
    expect(variables).toContain('--green-900:');
    expect(globals).not.toContain('fonts.googleapis.com');
  });
});
