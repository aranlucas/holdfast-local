/** Fail a fixture assumption explicitly before using nullable external API results. */
export function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }

  return value;
}
