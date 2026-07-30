export interface PartialDateValue {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

export interface EpochRangeValue {
  start_year?: number | null;
  start_month?: number | null;
  start_day?: number | null;
  end_year?: number | null;
  end_month?: number | null;
  end_day?: number | null;
}

export type EventEpochConflict = 'before' | 'after';
type DateTuple = readonly [number, number, number];

const italianMonths = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const;

function isPresent(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

export function isEmptyPartialDate(value: PartialDateValue): boolean {
  return !isPresent(value.year) && !isPresent(value.month) && !isPresent(value.day);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leapYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function partialDateError(
  value: PartialDateValue,
  label = 'La data',
): string | null {
  if (isEmptyPartialDate(value)) return null;
  if (!isPresent(value.year)) return `${label}: l’anno è obbligatorio.`;
  if (!Number.isInteger(value.year) || value.year < 1900) {
    return `${label}: l’anno non può essere precedente al 1900.`;
  }
  if (!isPresent(value.month)) {
    return isPresent(value.day) ? `${label}: il giorno richiede anche il mese.` : null;
  }
  if (!Number.isInteger(value.month) || value.month < 1 || value.month > 12) {
    return `${label}: il mese deve essere compreso tra 1 e 12.`;
  }
  if (!isPresent(value.day)) return null;
  const maximumDay = daysInMonth(value.year, value.month);
  if (!Number.isInteger(value.day) || value.day < 1 || value.day > maximumDay) {
    return `${label}: il giorno deve essere compreso tra 1 e ${maximumDay}.`;
  }
  return null;
}

export function partialDateBounds(
  value: PartialDateValue,
): readonly [DateTuple, DateTuple] {
  const error = partialDateError(value);
  if (error) throw new Error(error);
  if (!isPresent(value.year)) throw new Error('Una data vuota non ha estremi confrontabili.');
  if (!isPresent(value.month)) {
    return [[value.year, 1, 1], [value.year, 12, 31]];
  }
  if (!isPresent(value.day)) {
    return [
      [value.year, value.month, 1],
      [value.year, value.month, daysInMonth(value.year, value.month)],
    ];
  }
  const exact: DateTuple = [value.year, value.month, value.day];
  return [exact, exact];
}

function compareTuples(left: DateTuple, right: DateTuple): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function definitelyBefore(
  left: PartialDateValue,
  right: PartialDateValue,
): boolean {
  const [, leftLatest] = partialDateBounds(left);
  const [rightEarliest] = partialDateBounds(right);
  return compareTuples(leftLatest, rightEarliest) < 0;
}

export function definitelyAfter(
  left: PartialDateValue,
  right: PartialDateValue,
): boolean {
  const [leftEarliest] = partialDateBounds(left);
  const [, rightLatest] = partialDateBounds(right);
  return compareTuples(leftEarliest, rightLatest) > 0;
}

export function epochStart(epoch: EpochRangeValue): PartialDateValue {
  return {
    year: epoch.start_year,
    month: epoch.start_month,
    day: epoch.start_day,
  };
}

export function epochEnd(epoch: EpochRangeValue): PartialDateValue {
  return {
    year: epoch.end_year,
    month: epoch.end_month,
    day: epoch.end_day,
  };
}

export function epochRangeError(epoch: EpochRangeValue): string | null {
  const start = epochStart(epoch);
  const end = epochEnd(epoch);
  const startError = partialDateError(start, 'La data di inizio');
  if (startError) return startError;
  const endError = partialDateError(end, 'La data di fine');
  if (endError) return endError;
  if (!isEmptyPartialDate(start) && !isEmptyPartialDate(end) && definitelyAfter(start, end)) {
    return 'La data di inizio non può essere successiva alla data di fine.';
  }
  return null;
}

export function eventEpochConflict(
  eventDate: PartialDateValue,
  epoch: EpochRangeValue,
): EventEpochConflict | null {
  if (partialDateError(eventDate, 'La data dell’evento') || epochRangeError(epoch)) {
    return null;
  }
  if (isEmptyPartialDate(eventDate)) return null;
  const start = epochStart(epoch);
  const end = epochEnd(epoch);
  if (!isEmptyPartialDate(start) && definitelyBefore(eventDate, start)) return 'before';
  if (!isEmptyPartialDate(end) && definitelyAfter(eventDate, end)) return 'after';
  return null;
}

export function formatPartialDate(
  value: PartialDateValue,
  emptyLabel = 'Data sconosciuta',
): string {
  if (!isPresent(value.year)) return emptyLabel;
  if (!isPresent(value.month)) return String(value.year);
  const month = italianMonths[value.month - 1];
  if (!month) return String(value.year);
  return isPresent(value.day)
    ? `${value.day} ${month} ${value.year}`
    : `${month} ${value.year}`;
}

export function formatEpochRange(epoch: EpochRangeValue): string | null {
  const start = epochStart(epoch);
  const end = epochEnd(epoch);
  const hasStart = !isEmptyPartialDate(start);
  const hasEnd = !isEmptyPartialDate(end);
  if (hasStart && hasEnd) {
    return `Dal ${formatPartialDate(start)} al ${formatPartialDate(end)}`;
  }
  if (hasStart) return `Dal ${formatPartialDate(start)}`;
  if (hasEnd) return `Fino al ${formatPartialDate(end)}`;
  return null;
}
