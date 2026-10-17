import { minimatch } from 'minimatch';

export function matchesAny(path: string, globs: string[]): boolean {
  return globs.some((glob) => minimatch(path, glob, { dot: true }));
}
