// Utility helpers for digit normalization and Jalali/Gregorian conversion.
// Backend always stores Gregorian (YYYY-MM-DD); UI can render Jalali for fa.
export const DateUtils = {
  // Convert Persian digits to Latin digits to keep validation and parsing stable.
  toLatinDigits(value: string): string {
    const map: Record<string, string> = {
      '۰': '0',
      '۱': '1',
      '۲': '2',
      '۳': '3',
      '۴': '4',
      '۵': '5',
      '۶': '6',
      '۷': '7',
      '۸': '8',
      '۹': '9'
    };
    return value.replace(/[۰-۹]/g, (digit) => map[digit] ?? digit);
  },

  // Convert Latin digits to Persian digits for display only.
  toPersianDigits(value: string): string {
    const map: Record<string, string> = {
      '0': '۰',
      '1': '۱',
      '2': '۲',
      '3': '۳',
      '4': '۴',
      '5': '۵',
      '6': '۶',
      '7': '۷',
      '8': '۸',
      '9': '۹'
    };
    return value.replace(/\d/g, (digit) => map[digit] ?? digit);
  },

  // Normalize Jalali input by trimming, replacing "-" with "/", and zero-padding month/day.
  normalizeJalaliInput(value: string): string {
    const trimmed = value.trim().split(' ')[0] ?? value;
    const normalized = trimmed.replace(/-/g, '/');
    const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!match) {
      return normalized;
    }
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    return `${year}/${month}/${day}`;
  },

  // Normalize Gregorian input by trimming and keeping the date segment only.
  normalizeGregorian(value: string): string {
    const trimmed = value.trim().split(' ')[0] ?? value;
    return trimmed;
  },

  // Convert a Gregorian date string to Jalali (YYYY/MM/DD).
  // If the value is already Jalali, it is returned as-is.
  toJalali(value: string): string {
    const latin = this.toLatinDigits(value);
    const gregorian = this.normalizeGregorian(latin);
    if (this.isGregorianFormat(gregorian)) {
      const [gy, gm, gd] = gregorian.split('-').map((part) => Number(part));
      const [jy, jm, jd] = this.gregorianToJalali(gy, gm, gd);
      return `${String(jy).padStart(4, '0')}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
    }
    const normalized = this.normalizeJalaliInput(latin);
    if (this.isJalaliFormat(normalized)) {
      return normalized;
    }
    return value;
  },

  // Convert a Jalali date string to Gregorian (YYYY-MM-DD).
  // If the value is already Gregorian, it is returned as-is.
  toGregorian(value: string): string {
    const latin = this.toLatinDigits(value);
    const normalized = this.normalizeJalaliInput(latin);
    if (this.isGregorianFormat(this.normalizeGregorian(latin))) {
      return this.normalizeGregorian(latin);
    }
    if (!this.isJalaliFormat(normalized)) {
      return latin;
    }
    const [jy, jm, jd] = normalized.split('/').map((part) => Number(part));
    const [gy, gm, gd] = this.jalaliToGregorian(jy, jm, jd);
    return `${String(gy).padStart(4, '0')}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
  },

  // Check if a Jalali date is valid for month length and range.
  isValidJalaliDate(jy: number, jm: number, jd: number): boolean {
    if (jm < 1 || jm > 12 || jd < 1) {
      return false;
    }
    const maxDay = this.jalaliMonthLength(jy, jm);
    return jd <= maxDay;
  },

  // Compute Jalali month length using Jalali->Gregorian conversion.
  // This keeps month length correct for Esfand in leap years.
  jalaliMonthLength(jy: number, jm: number): number {
    if (jm < 1 || jm > 12) {
      return 0;
    }
    const [gy1, gm1, gd1] = this.jalaliToGregorian(jy, jm, 1);
    const nextMonth = jm === 12 ? 1 : jm + 1;
    const nextYear = jm === 12 ? jy + 1 : jy;
    const [gy2, gm2, gd2] = this.jalaliToGregorian(nextYear, nextMonth, 1);
    const date1 = new Date(Date.UTC(gy1, gm1 - 1, gd1));
    const date2 = new Date(Date.UTC(gy2, gm2 - 1, gd2));
    const diff = Math.round((date2.getTime() - date1.getTime()) / 86400000);
    return diff;
  },

  // Return JS weekday (0=Sunday..6=Saturday) for a Jalali date.
  jalaliWeekday(jy: number, jm: number, jd: number): number {
    const [gy, gm, gd] = this.jalaliToGregorian(jy, jm, jd);
    const date = new Date(Date.UTC(gy, gm - 1, gd));
    return date.getUTCDay();
  },

  // Check if a Gregorian date string is a real calendar date.
  isValidGregorianDate(value: string): boolean {
    if (!this.isGregorianFormat(value)) {
      return false;
    }
    const [gy, gm, gd] = value.split('-').map((part) => Number(part));
    if (gm < 1 || gm > 12 || gd < 1) {
      return false;
    }
    const date = new Date(Date.UTC(gy, gm - 1, gd));
    return (
      date.getUTCFullYear() === gy &&
      date.getUTCMonth() === gm - 1 &&
      date.getUTCDate() === gd
    );
  },

  // Jalali -> Gregorian conversion based on the classic 33-year cycle algorithm.
  jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
    const year = jy - 979;
    const month = jm - 1;
    const day = jd - 1;

    const jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
    const gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    let jDayNo = 365 * year + Math.floor(year / 33) * 8 + Math.floor((year % 33 + 3) / 4);
    for (let i = 0; i < month; i += 1) {
      jDayNo += jDaysInMonth[i];
    }
    jDayNo += day;

    let gDayNo = jDayNo + 79;

    let gy = 1600 + 400 * Math.floor(gDayNo / 146097);
    gDayNo %= 146097;

    let leap = true;
    if (gDayNo >= 36525) {
      gDayNo -= 1;
      gy += 100 * Math.floor(gDayNo / 36524);
      gDayNo %= 36524;

      if (gDayNo >= 365) {
        gDayNo += 1;
      } else {
        leap = false;
      }
    }

    gy += 4 * Math.floor(gDayNo / 1461);
    gDayNo %= 1461;

    if (gDayNo >= 366) {
      leap = false;
      gDayNo -= 1;
      gy += Math.floor(gDayNo / 365);
      gDayNo %= 365;
    }

    let gm = 0;
    for (let i = 0; i < 12; i += 1) {
      const days = gDaysInMonth[i] + (i === 1 && leap ? 1 : 0);
      if (gDayNo < days) {
        gm = i + 1;
        break;
      }
      gDayNo -= days;
    }

    const gd = gDayNo + 1;

    return [gy, gm, gd];
  },

  // Gregorian -> Jalali conversion based on the classic 33-year cycle algorithm.
  gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
    const year = gy - 1600;
    const month = gm - 1;
    const day = gd - 1;

    const gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

    let gDayNo =
      365 * year + Math.floor((year + 3) / 4) - Math.floor((year + 99) / 100) + Math.floor((year + 399) / 400);
    for (let i = 0; i < month; i += 1) {
      gDayNo += gDaysInMonth[i];
    }
    if (month > 1 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) {
      gDayNo += 1;
    }
    gDayNo += day;

    let jDayNo = gDayNo - 79;
    let jy = 979 + 33 * Math.floor(jDayNo / 12053);
    jDayNo %= 12053;
    jy += 4 * Math.floor(jDayNo / 1461);
    jDayNo %= 1461;

    if (jDayNo >= 366) {
      jy += Math.floor((jDayNo - 1) / 365);
      jDayNo = (jDayNo - 1) % 365;
    }

    let i = 0;
    for (; i < 12 && jDayNo >= jDaysInMonth[i]; i += 1) {
      jDayNo -= jDaysInMonth[i];
    }

    const jd = jDayNo + 1;
    const jm = i + 1;
    return [jy, jm, jd];
  },

  // Check for Jalali date format (YYYY/MM/DD).
  isJalaliFormat(value: string): boolean {
    return /^\d{4}\/\d{2}\/\d{2}$/.test(value);
  },

  // Check for Gregorian date format (YYYY-MM-DD).
  isGregorianFormat(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }
};
