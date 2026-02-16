<?php

namespace App\Support;

class Validators
{
    // Validate Gregorian birth date format (YYYY-MM-DD). Jalali is handled in frontend.
    public static function isValidBirthDateFormat(?string $value): bool
    {
        if (blank($value)) {
            return true;
        }

        return (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $value);
    }

    // Validate Iranian IBAN (Sheba) with checksum.
    public static function isValidIban(string $value): bool
    {
        $raw = strtoupper(trim($value));
        $normalized = strtoupper(preg_replace('/\s+/', '', $value) ?? '');

        if (! preg_match('/^IR\d{2}\s?\d{3}\s?\d{19}$/', $raw)) {
            if (! preg_match('/^IR\d{24}$/', $normalized)) {
                return false;
            }
        }

        $iban = $normalized;

        if (! preg_match('/^IR\d{24}$/', $iban)) {
            return false;
        }

        $rearranged = substr($iban, 4) . substr($iban, 0, 4);
        $numeric = '';

        foreach (str_split($rearranged) as $char) {
            if (ctype_digit($char)) {
                $numeric .= $char;
                continue;
            }

            $numeric .= (string) (ord($char) - 55);
        }

        $remainder = 0;
        foreach (str_split($numeric) as $digit) {
            $remainder = ($remainder * 10 + (int) $digit) % 97;
        }

        return $remainder === 1;
    }

    // Validate Iranian national ID (code meli) checksum.
    public static function isValidIranianIdNumber(string $value): bool
    {
        $raw = trim($value);

        if (! preg_match('/^(\d{8,10}|\d{1,3}-\d{6}-\d{1})$/', $raw)) {
            return false;
        }

        $code = preg_replace('/\D+/', '', $raw) ?? '';

        if (strlen($code) === 8) {
            $code = '00' . $code;
        } elseif (strlen($code) === 9) {
            $code = '0' . $code;
        }

        if (strlen($code) !== 10 || strlen(str_replace($code[0], '', $code)) === 0) {
            return false;
        }

        $digits = array_map('intval', str_split($code));
        $sum = 0;

        for ($i = 0; $i < 9; $i++) {
            $sum += $digits[$i] * (10 - $i);
        }

        $remainder = $sum % 11;
        $checkDigit = $digits[9];

        return $remainder < 2
            ? $checkDigit === $remainder
            : $checkDigit === (11 - $remainder);
    }
}
