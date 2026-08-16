import { validateSelectedIndex } from '../answer.validation';

describe('validateSelectedIndex', () => {
  it('rejects non-integer and out-of-range answer indices', () => {
    expect(validateSelectedIndex(-1, 4)).toBeNull();
    expect(validateSelectedIndex(1.5, 4)).toBeNull();
    expect(validateSelectedIndex(4, 4)).toBeNull();
    expect(validateSelectedIndex(2, 4)).toBe(2);
  });
});
