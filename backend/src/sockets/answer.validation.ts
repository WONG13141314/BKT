/** Converts untrusted answer payloads into an index or explicit no-answer evidence. */
export function validateSelectedIndex(value: unknown, optionCount: number): number | null {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < optionCount
    ? value as number
    : null;
}
