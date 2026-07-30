import { describe, expect, it } from 'vitest';
import {
  definitelyAfter,
  definitelyBefore,
  eventEpochConflict,
  formatEpochRange,
  formatPartialDate,
  partialDateBounds,
  partialDateError,
  epochRangeError,
} from './partialDates';

describe('partial dates', () => {
  it('uses Gregorian bounds and leap years', () => {
    expect(partialDateBounds({ year: 2025 })).toEqual([
      [2025, 1, 1],
      [2025, 12, 31],
    ]);
    expect(partialDateBounds({ year: 2024, month: 2 })).toEqual([
      [2024, 2, 1],
      [2024, 2, 29],
    ]);
    expect(partialDateBounds({ year: 2025, month: 2 })).toEqual([
      [2025, 2, 1],
      [2025, 2, 28],
    ]);
    expect(partialDateError({ year: 2025, month: 2, day: 29 })).toMatch(/1 e 28/);
    expect(partialDateError({ year: 2024, month: 2, day: 29 })).toBeNull();
  });

  it('compares only definitely separated partial dates', () => {
    expect(definitelyBefore({ year: 2024 }, { year: 2025, month: 3 })).toBe(true);
    expect(definitelyBefore({ year: 2025 }, { year: 2025, month: 3 })).toBe(false);
    expect(definitelyAfter({ year: 2025, month: 4 }, { year: 2025, month: 3 })).toBe(true);
    expect(definitelyAfter({ year: 2025 }, { year: 2025, month: 3 })).toBe(false);
  });

  it('validates epoch ordering conservatively', () => {
    expect(epochRangeError({
      start_year: 2025,
      end_year: 2025,
      end_month: 3,
    })).toBeNull();
    expect(epochRangeError({
      start_year: 2025,
      start_month: 4,
      end_year: 2025,
      end_month: 3,
    })).toMatch(/successiva/);
  });

  it('checks both one-sided and complete epoch ranges', () => {
    expect(eventEpochConflict(
      { year: 2024 },
      { start_year: 2025, start_month: 3 },
    )).toBe('before');
    expect(eventEpochConflict(
      { year: 2026 },
      { end_year: 2025, end_month: 10 },
    )).toBe('after');
    expect(eventEpochConflict(
      { year: 2025 },
      {
        start_year: 2025,
        start_month: 3,
        end_year: 2025,
        end_month: 10,
      },
    )).toBeNull();
    expect(eventEpochConflict(
      {},
      { start_year: 2025, end_year: 2025 },
    )).toBeNull();
  });

  it('formats partial dates and epoch ranges in Italian', () => {
    expect(formatPartialDate({ year: 2025 })).toBe('2025');
    expect(formatPartialDate({ year: 2025, month: 7 })).toBe('luglio 2025');
    expect(formatPartialDate({ year: 2025, month: 7, day: 14 })).toBe('14 luglio 2025');
    expect(formatPartialDate({})).toBe('Data sconosciuta');
    expect(formatEpochRange({ start_year: 2020, end_year: 2025, end_month: 7 }))
      .toBe('Dal 2020 al luglio 2025');
    expect(formatEpochRange({ start_year: 2020 })).toBe('Dal 2020');
    expect(formatEpochRange({ end_year: 2025, end_month: 7 })).toBe('Fino al luglio 2025');
    expect(formatEpochRange({})).toBeNull();
  });
});
