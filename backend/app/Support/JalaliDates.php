<?php

namespace App\Support;

use Carbon\Carbon;
use Carbon\CarbonInterface;

class JalaliDates
{
    public static function toJalali(string|CarbonInterface|null $value, ?string $locale = null): ?string
    {
        if ($value instanceof CarbonInterface) {
            $value = $value->toDateString();
        }

        if (blank($value) || ($locale ?? app()->getLocale()) !== 'fa') {
            return $value;
        }

        try {
            $date = Carbon::parse($value, config('app.timezone'));
            [$jy, $jm, $jd] = static::gregorianToJalali(
                (int) $date->year,
                (int) $date->month,
                (int) $date->day
            );

            return sprintf('%04d/%02d/%02d', $jy, $jm, $jd);
        } catch (\Throwable) {
            return $value;
        }
    }

    public static function toJalaliDisplay(string|CarbonInterface|null $value, ?string $locale = null): ?string
    {
        if ($value instanceof CarbonInterface) {
            $value = $value->toDateString();
        }

        if (blank($value) || ($locale ?? app()->getLocale()) !== 'fa') {
            return $value;
        }

        try {
            $date = Carbon::parse($value, config('app.timezone'));
            [$jy, $jm, $jd] = static::gregorianToJalali(
                (int) $date->year,
                (int) $date->month,
                (int) $date->day
            );

            return static::toPersianDigits(sprintf('%04d/%02d/%02d', $jy, $jm, $jd));
        } catch (\Throwable) {
            return $value;
        }
    }

    public static function toGregorian(string|CarbonInterface|null $value, ?string $locale = null): ?string
    {
        if ($value instanceof CarbonInterface) {
            $value = $value->toDateString();
        }

        if (blank($value) || ($locale ?? app()->getLocale()) !== 'fa') {
            return $value;
        }

        try {
            $latin = static::toLatinDigits($value);
            $latin = static::normalizeJalaliInput($latin);

            if (! preg_match('/^(\d{4})\/(\d{2})\/(\d{2})$/', $latin, $matches)) {
                return $value;
            }

            $jy = (int) $matches[1];
            $jm = (int) $matches[2];
            $jd = (int) $matches[3];
            [$gy, $gm, $gd] = static::jalaliToGregorian($jy, $jm, $jd);

            return sprintf('%04d-%02d-%02d', $gy, $gm, $gd);
        } catch (\Throwable) {
            return $value;
        }
    }

    public static function normalizeGregorian(string|CarbonInterface|null $value): ?string
    {
        if (blank($value)) {
            return $value;
        }

        if ($value instanceof CarbonInterface) {
            return $value->toDateString();
        }

        try {
            return Carbon::parse($value, config('app.timezone'))->toDateString();
        } catch (\Throwable) {
            $parts = preg_split('/\s+/', (string) $value);

            return $parts[0] ?? (string) $value;
        }
    }

    private static function jalaliToGregorian(int $jy, int $jm, int $jd): array
    {
        $jy -= 979;
        $jm -= 1;
        $jd -= 1;

        $jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
        $gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

        $jDayNo = 365 * $jy + intdiv($jy, 33) * 8 + intdiv(($jy % 33) + 3, 4);
        for ($i = 0; $i < $jm; $i++) {
            $jDayNo += $jDaysInMonth[$i];
        }
        $jDayNo += $jd;

        $gDayNo = $jDayNo + 79;

        $gy = 1600 + 400 * intdiv($gDayNo, 146097);
        $gDayNo %= 146097;

        $leap = true;
        if ($gDayNo >= 36525) {
            $gDayNo--;
            $gy += 100 * intdiv($gDayNo, 36524);
            $gDayNo %= 36524;

            if ($gDayNo >= 365) {
                $gDayNo++;
            } else {
                $leap = false;
            }
        }

        $gy += 4 * intdiv($gDayNo, 1461);
        $gDayNo %= 1461;

        if ($gDayNo >= 366) {
            $leap = false;
            $gDayNo--;
            $gy += intdiv($gDayNo, 365);
            $gDayNo %= 365;
        }

        $gm = 0;
        for ($i = 0; $i < 12; $i++) {
            $days = $gDaysInMonth[$i] + ($i === 1 && $leap ? 1 : 0);
            if ($gDayNo < $days) {
                $gm = $i + 1;
                break;
            }
            $gDayNo -= $days;
        }

        $gd = $gDayNo + 1;

        return [$gy, $gm, $gd];
    }

    private static function gregorianToJalali(int $gy, int $gm, int $gd): array
    {
        $gy -= 1600;
        $gm -= 1;
        $gd -= 1;

        $gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        $jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

        $gDayNo = 365 * $gy + intdiv($gy + 3, 4) - intdiv($gy + 99, 100) + intdiv($gy + 399, 400);
        for ($i = 0; $i < $gm; $i++) {
            $gDayNo += $gDaysInMonth[$i];
        }
        if ($gm > 1 && (($gy % 4 === 0 && $gy % 100 !== 0) || ($gy % 400 === 0))) {
            $gDayNo++;
        }
        $gDayNo += $gd;

        $jDayNo = $gDayNo - 79;
        $jy = 979 + 33 * intdiv($jDayNo, 12053);
        $jDayNo %= 12053;
        $jy += 4 * intdiv($jDayNo, 1461);
        $jDayNo %= 1461;

        if ($jDayNo >= 366) {
            $jy += intdiv($jDayNo - 1, 365);
            $jDayNo = ($jDayNo - 1) % 365;
        }

        for ($i = 0; $i < 12 && $jDayNo >= $jDaysInMonth[$i]; $i++) {
            $jDayNo -= $jDaysInMonth[$i];
        }

        $jm = $i + 1;
        $jd = $jDayNo + 1;

        return [$jy, $jm, $jd];
    }

    private static function toLatinDigits(string $value): string
    {
        $map = [
            '۰' => '0',
            '۱' => '1',
            '۲' => '2',
            '۳' => '3',
            '۴' => '4',
            '۵' => '5',
            '۶' => '6',
            '۷' => '7',
            '۸' => '8',
            '۹' => '9',
        ];

        return strtr($value, $map);
    }

    private static function toPersianDigits(string $value): string
    {
        $map = [
            '0' => '۰',
            '1' => '۱',
            '2' => '۲',
            '3' => '۳',
            '4' => '۴',
            '5' => '۵',
            '6' => '۶',
            '7' => '۷',
            '8' => '۸',
            '9' => '۹',
        ];

        return strtr($value, $map);
    }

    private static function normalizeJalaliInput(string $value): string
    {
        $value = trim($value);
        $value = explode(' ', $value)[0] ?? $value;

        return str_replace('-', '/', $value);
    }
}
