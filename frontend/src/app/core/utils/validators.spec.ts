import { Validators } from './validators';

describe('Validators util', () => {
  const buildValidIranianId = (prefix9: string): string => {
    const digits = prefix9.split('').map((part) => Number(part));
    let sum = 0;
    for (let i = 0; i < 9; i += 1) {
      sum += digits[i] * (10 - i);
    }
    const remainder = sum % 11;
    const check = remainder < 2 ? remainder : 11 - remainder;
    return `${prefix9}${check}`;
  };

  const buildValidIranianIban = (body22: string): string => {
    const withPlaceholder = `${body22}IR00`;
    let numeric = '';
    for (const char of withPlaceholder) {
      numeric += /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    }
    let remainder = 0;
    for (const digit of numeric) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
    const check = String(98 - remainder).padStart(2, '0');
    return `IR${check}${body22}`;
  };

  it('validates birth date format by locale', () => {
    expect(Validators.isValidBirthDateFormat('1403/1/9', 'fa')).toBe(true);
    expect(Validators.isValidBirthDateFormat('1403-01-09', 'fa')).toBe(true);
    expect(Validators.isValidBirthDateFormat('2026-02-11', 'en')).toBe(true);
    expect(Validators.isValidBirthDateFormat('11/02/2026', 'en')).toBe(false);
  });

  it('validates Iranian ID numbers', () => {
    expect(Validators.isValidIranianIdNumber(buildValidIranianId('123456789'))).toBe(true);
    expect(Validators.isValidIranianIdNumber('1111111111')).toBe(false);
    expect(Validators.isValidIranianIdNumber('abc')).toBe(false);
  });

  it('validates Iranian IBAN', () => {
    expect(Validators.isValidIban(buildValidIranianIban('1234567890123456789012'))).toBe(true);
    expect(Validators.isValidIban('IR00INVALID0000000000000000')).toBe(false);
  });
});
