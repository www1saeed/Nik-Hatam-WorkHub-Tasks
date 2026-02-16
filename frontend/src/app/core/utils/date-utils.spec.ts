import { DateUtils } from './date-utils';

describe('DateUtils', () => {
  it('converts digits between latin and persian', () => {
    expect(DateUtils.toPersianDigits('123')).toBe('۱۲۳');
    expect(DateUtils.toLatinDigits('۱۲۳')).toBe('123');
  });

  it('normalizes jalali input without leading zeros', () => {
    expect(DateUtils.normalizeJalaliInput('1400/3/8')).toBe('1400/03/08');
  });

  it('converts jalali to gregorian and back', () => {
    const g = DateUtils.toGregorian('1404/01/01');
    expect(DateUtils.isGregorianFormat(g)).toBe(true);

    const j = DateUtils.toJalali(g);
    expect(DateUtils.isJalaliFormat(j)).toBe(true);
  });

  it('validates real gregorian dates', () => {
    expect(DateUtils.isValidGregorianDate('2026-02-11')).toBe(true);
    expect(DateUtils.isValidGregorianDate('2026-02-31')).toBe(false);
  });
});

