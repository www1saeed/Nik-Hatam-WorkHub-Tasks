<?php

namespace App\Support;

use Carbon\CarbonImmutable;

class TaskAuditFormatter
{
    public static function formatDateTime(?CarbonImmutable $value, string $locale): string
    {
        if ($value === null) {
            return trans('tasks.system.empty', [], $locale);
        }

        $local = $value->setTimezone(config('app.timezone'));
        $time = JalaliDates::localizeDigits($local->format('H:i'), $locale);

        if ($locale === 'fa') {
            $jalaliDate = JalaliDates::toJalaliDisplay($local->toDateString(), 'fa') ?? $local->toDateString();

            return "{$jalaliDate} {$time}";
        }

        return $local->format('Y-m-d') . " {$time}";
    }
}
