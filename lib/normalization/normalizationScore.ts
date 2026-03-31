// Normalization scoring utility for column profiling
import { ColumnProfile } from '../types/correlation';

export interface NormalizationScoreResult {
  formatDifference: number;
  mixedType: number;
  dirtyValue: number;
  score: number;
  normalizationLevel: 'none' | 'light' | 'strong';
}

export function computeNormalizationScore(profile: ColumnProfile): NormalizationScoreResult {
  const total = profile.sampleValues.length;
  if (total === 0) {
    return { formatDifference: 0, mixedType: 0, dirtyValue: 0, score: 0, normalizationLevel: 'none' };
  }

  // 1. Format Difference
  const formatMap: Record<string, number> = {};
  for (const v of profile.sampleValues) {
    const format = detectFormat(v);
    formatMap[format] = (formatMap[format] || 0) + 1;
  }
  const mostCommonFormatCount = Math.max(...Object.values(formatMap));
  const formatDifference = 1 - mostCommonFormatCount / total;

  // 2. Mixed Type
  const typeMap: Record<string, number> = {};
  for (const v of profile.sampleValues) {
    const t = detectType(v);
    typeMap[t] = (typeMap[t] || 0) + 1;
  }
  const mostCommonTypeCount = Math.max(...Object.values(typeMap));
  const mixedType = 1 - mostCommonTypeCount / total;

  // 3. Dirty Value
  let dirtyCount = 0;
  for (const v of profile.sampleValues) {
    if (isDirtyValue(v)) dirtyCount++;
  }
  const dirtyValue = dirtyCount / total;

  // Final score
  const score = 0.4 * formatDifference + 0.3 * mixedType + 0.3 * dirtyValue;
  let normalizationLevel: 'none' | 'light' | 'strong' = 'none';
  if (score > 0.4) normalizationLevel = 'strong';
  else if (score >= 0.2) normalizationLevel = 'light';

  return { formatDifference, mixedType, dirtyValue, score, normalizationLevel };
}

function detectFormat(value: string): string {
  // Simple heuristics for format
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(value)) return 'comma-number';
  if (/^\d+\.\d+$/.test(value)) return 'decimal';
  if (/^[₹$€£¥]\d+/.test(value)) return 'currency';
  if (/^\d{2,4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(value)) return 'date';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'iso-date';
  return 'other';
}

function detectType(value: string): string {
  if (/^\d+$/.test(value)) return 'number';
  if (/^\d+\.\d+$/.test(value)) return 'number';
  if (/^\d{2,4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(value)) return 'date';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return 'datetime';
  if (!value.trim()) return 'blank';
  return 'text';
}

function isDirtyValue(value: string): boolean {
  return /[\s,₹$€£¥()\/\[\]{}#@!%^&*_=+|;:'"<>?]/.test(value) || /[A-Z]/.test(value) && value !== value.toUpperCase();
}
