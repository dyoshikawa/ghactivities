const UNITS: Record<string, number> = {
  B: 1,
  K: 1024,
  M: 1024 * 1024,
  G: 1024 * 1024 * 1024,
};

export function parseSize(sizeStr: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*([BKMG])$/i.exec(sizeStr.trim());
  if (!match) {
    throw new Error(
      `Invalid size format: "${sizeStr}". Expected format: <number><unit> (e.g., 1B, 2K, 2M)`,
    );
  }
  const value = Number(match[1]);
  const unit = match[2]!.toUpperCase();
  const multiplier = UNITS[unit];
  if (multiplier === undefined) {
    throw new Error(`Unknown size unit: "${unit}"`);
  }
  return Math.floor(value * multiplier);
}
