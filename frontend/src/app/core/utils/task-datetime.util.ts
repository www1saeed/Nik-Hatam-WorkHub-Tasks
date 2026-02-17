import { DateUtils } from './date-utils';

/**
 * Shared task datetime helpers.
 *
 * Business rule:
 * - Task planning uses Tehran wall-clock time in the UI.
 * - API payload persists UTC ISO timestamps.
 */
export class TaskDateTimeUtils {
  private static readonly BUSINESS_TIMEZONE = 'Asia/Tehran';
  private static readonly TEHRAN_OFFSET_MINUTES = 210; // UTC+03:30

  /**
   * Format an ISO timestamp for UI display in the business timezone.
   *
   * Locale behavior:
   * - `fa` => Persian calendar + Persian digits
   * - other => English Gregorian formatting
   */
  static formatDateTime(iso: string, language: string): string {
    const date = new Date(iso);
    if (language === 'fa') {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        timeZone: TaskDateTimeUtils.BUSINESS_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    }

    return date.toLocaleString('en-US', {
      timeZone: TaskDateTimeUtils.BUSINESS_TIMEZONE,
      hour12: false,
    });
  }

  /**
   * Convert ISO timestamp to date-input value for the active language.
   *
   * Output:
   * - `fa` => Jalali `YYYY/MM/DD`
   * - others => Gregorian `YYYY-MM-DD`
   */
  static toInputDate(iso: string | null | undefined, language: string): string {
    if (!iso) {
      return '';
    }

    const parts = TaskDateTimeUtils.toBusinessDateTimeParts(iso);
    const gregorian = `${parts.year}-${parts.month}-${parts.day}`;
    if (language === 'fa') {
      return DateUtils.toJalali(gregorian);
    }
    return gregorian;
  }

  /**
   * Convert ISO timestamp to Tehran time (`HH:mm`) for time inputs.
   */
  static toInputTime(iso: string | null | undefined): string {
    if (!iso) {
      return '';
    }

    const parts = TaskDateTimeUtils.toBusinessDateTimeParts(iso);
    return `${parts.hour}:${parts.minute}`;
  }

  /**
   * Build UTC ISO payload value from date/time form controls.
   *
   * Steps:
   * - normalize/convert date according to language
   * - treat entered value as Tehran wall-clock time
   * - convert to UTC ISO string for API persistence
   */
  static combineDateTimeForApi(dateValue: string, timeValue: string, language: string): string | null {
    const rawDate = (dateValue ?? '').trim();
    if (!rawDate) {
      return null;
    }

    const rawTime = (timeValue ?? '').trim() || '00:00';
    const normalizedDate = TaskDateTimeUtils.normalizeDateForApi(rawDate, language);
    if (!normalizedDate) {
      return null;
    }

    return TaskDateTimeUtils.businessDateTimeToUtcIso(normalizedDate, rawTime);
  }

  /**
   * Normalize UI date input to Gregorian `YYYY-MM-DD` before UTC conversion.
   */
  private static normalizeDateForApi(rawDate: string, language: string): string | null {
    const latin = DateUtils.toLatinDigits(rawDate);
    if (language === 'fa') {
      return DateUtils.toGregorian(latin);
    }

    const normalized = DateUtils.normalizeGregorian(latin);
    return normalized || null;
  }

  /**
   * Convert a Tehran local date+time pair to UTC ISO.
   *
   * Important:
   * - this method uses fixed +03:30 offset by current business rule
   * - if DST rules are introduced later, this conversion should be upgraded
   */
  private static businessDateTimeToUtcIso(gregorianDate: string, hhmm: string): string | null {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gregorianDate);
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(hhmm);
    if (!dateMatch || !timeMatch) {
      return null;
    }

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (
      Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day) ||
      Number.isNaN(hour) || Number.isNaN(minute)
    ) {
      return null;
    }

    const utcMs = Date.UTC(year, month - 1, day, hour, minute) - (TaskDateTimeUtils.TEHRAN_OFFSET_MINUTES * 60 * 1000);
    return new Date(utcMs).toISOString();
  }

  /**
   * Read Tehran timezone date/time parts from ISO timestamp.
   *
   * This is used by both date and time input mappers.
   */
  private static toBusinessDateTimeParts(iso: string): {
    year: string;
    month: string;
    day: string;
    hour: string;
    minute: string;
  } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TaskDateTimeUtils.BUSINESS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(iso));

    const read = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? '';

    return {
      year: read('year'),
      month: read('month'),
      day: read('day'),
      hour: read('hour'),
      minute: read('minute'),
    };
  }
}
