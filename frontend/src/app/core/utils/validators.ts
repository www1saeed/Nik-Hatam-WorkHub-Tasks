import { DateUtils } from './date-utils';
import { UiLocale } from './locale';

// Frontend validation helpers (lightweight and synchronous).
export const Validators = {
  // Password policy: at least 8 chars, 1 uppercase, 1 lowercase, 1 digit.
  passwordPattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,

  // Validate date format per locale without parsing the date.
  isValidBirthDateFormat(value: string | null, locale: UiLocale): boolean {
    if (!value) {
      return true;
    }
    const latin = DateUtils.toLatinDigits(value);
    const normalized = locale === 'fa' ? DateUtils.normalizeJalaliInput(latin) : DateUtils.normalizeGregorian(latin);
    const pattern = locale === 'fa' ? /^\d{4}\/\d{2}\/\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
    return pattern.test(normalized);
  },

  // Validate Iranian national ID (code meli) checksum.
  isValidIranianIdNumber(value: string): boolean {
    const raw = DateUtils.toLatinDigits(value).trim();
    if (!/^(\d{8,10}|\d{1,3}-\d{6}-\d{1})$/.test(raw)) {
      return false;
    }
    let code = raw.replace(/\D+/g, '');
    if (code.length === 8) {
      code = `00${code}`;
    } else if (code.length === 9) {
      code = `0${code}`;
    }
    if (code.length !== 10 || code.split(code[0]).join('').length === 0) {
      return false;
    }
    const digits = code.split('').map((d) => Number(d));
    let sum = 0;
    for (let i = 0; i < 9; i += 1) {
      sum += digits[i] * (10 - i);
    }
    const remainder = sum % 11;
    const checkDigit = digits[9];
    return remainder < 2 ? checkDigit === remainder : checkDigit === 11 - remainder;
  },

  // Validate Iranian IBAN (sheba) with checksum.
  isValidIban(value: string): boolean {
    const raw = DateUtils.toLatinDigits(value).trim().toUpperCase();
    const normalized = raw.replace(/\s+/g, '');
    if (!/^IR\d{2}\s?\d{3}\s?\d{19}$/.test(raw)) {
      if (!/^IR\d{24}$/.test(normalized)) {
        return false;
      }
    }
    if (!/^IR\d{24}$/.test(normalized)) {
      return false;
    }
    const rearranged = normalized.slice(4) + normalized.slice(0, 4);
    let numeric = '';
    for (const char of rearranged) {
      if (/\d/.test(char)) {
        numeric += char;
      } else {
        numeric += String(char.charCodeAt(0) - 55);
      }
    }
    let remainder = 0;
    for (const digit of numeric) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return remainder === 1;
  }
};
