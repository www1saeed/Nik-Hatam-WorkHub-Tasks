import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, Input, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged } from 'rxjs';
import { DateUtils } from '../core/utils/date-utils';
import { LanguageService } from '../core/services/language.service';

@Component({
  selector: 'app-jalali-datepicker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './jalali-datepicker.component.html',
  styleUrl: './jalali-datepicker.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => JalaliDatepickerComponent),
      multi: true
    }
  ]
})
export class JalaliDatepickerComponent implements ControlValueAccessor {
  private readonly languageService = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  @Input() placeholder = '';
  @Input() invalid = false;
  @Input() inputId?: string;
  @Input() disabled = false;

  displayValue = '';
  gregorianValue = '';
  isOpen = false;
  viewYear = 1400;
  viewMonth = 1;
  weeks: (number | null)[][] = [];
  todayJalali = '';
  viewMode: 'date' | 'month' | 'year' = 'date';
  readonly monthsGrid = [
    'فروردین',
    'اردیبهشت',
    'خرداد',
    'تیر',
    'مرداد',
    'شهریور',
    'مهر',
    'آبان',
    'آذر',
    'دی',
    'بهمن',
    'اسفند'
  ];

  readonly monthNames = this.monthsGrid;

  readonly weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  readonly yearOptions: number[] = [];

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    const [jy] = DateUtils.gregorianToJalali(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth() + 1,
      new Date().getUTCDate()
    );
    const todayGregorian = `${String(new Date().getUTCFullYear()).padStart(4, '0')}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}-${String(new Date().getUTCDate()).padStart(2, '0')}`;
    this.todayJalali = DateUtils.toJalali(todayGregorian);
    const [todayYear, todayMonth] = this.todayJalali.split('/').map((part) => Number(part));
    const start = jy - 100;
    const end = jy + 20;
    for (let y = start; y <= end; y += 1) {
      this.yearOptions.push(y);
    }
    this.viewYear = Number.isFinite(todayYear) ? todayYear : jy;
    this.viewMonth = Number.isFinite(todayMonth) ? todayMonth : 1;
    this.rebuildCalendar();

    this.languageService.current$
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((locale) => {
        if (locale === 'fa' && this.gregorianValue) {
          const jalali = DateUtils.toJalali(this.gregorianValue);
          this.displayValue = DateUtils.toPersianDigits(jalali);
          const [jy, jm] = jalali.split('/').map((part) => Number(part));
          if (Number.isFinite(jy) && Number.isFinite(jm)) {
            this.viewYear = jy;
            this.viewMonth = jm;
            this.rebuildCalendar();
          }
        }
      });
  }

  writeValue(value: string | null): void {
    const raw = value ?? '';
    const latin = DateUtils.toLatinDigits(raw);
    const normalizedJalali = DateUtils.normalizeJalaliInput(latin);
    if (DateUtils.isJalaliFormat(normalizedJalali)) {
      const [jy, jm, jd] = normalizedJalali.split('/').map((part) => Number(part));
      if (DateUtils.isValidJalaliDate(jy, jm, jd)) {
        this.gregorianValue = DateUtils.toGregorian(normalizedJalali);
        this.displayValue = DateUtils.toPersianDigits(normalizedJalali);
        this.viewYear = jy;
        this.viewMonth = jm;
        this.rebuildCalendar();
        return;
      }
    }

    const normalizedGregorian = DateUtils.normalizeGregorian(latin);
    if (DateUtils.isGregorianFormat(normalizedGregorian) && DateUtils.isValidGregorianDate(normalizedGregorian)) {
      this.gregorianValue = normalizedGregorian;
      const jalali = DateUtils.toJalali(normalizedGregorian);
      this.displayValue = DateUtils.toPersianDigits(jalali);
      const [jy, jm] = jalali.split('/').map((part) => Number(part));
      if (Number.isFinite(jy) && Number.isFinite(jm)) {
        this.viewYear = jy;
        this.viewMonth = jm;
        this.rebuildCalendar();
      }
      return;
    }

    this.gregorianValue = '';
    this.displayValue = raw;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  toggle(): void {
    if (this.disabled) {
      return;
    }
    this.isOpen = !this.isOpen;
  }

  open(): void {
    if (this.disabled) {
      return;
    }
    if (!this.gregorianValue) {
      const fallback = this.defaultGregorianDate();
      const jalali = DateUtils.toJalali(fallback);
      const [jy, jm] = jalali.split('/').map((part) => Number(part));
      if (Number.isFinite(jy) && Number.isFinite(jm)) {
        this.viewYear = jy;
        this.viewMonth = jm;
        this.rebuildCalendar();
      }
    }
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
    this.viewMode = 'date';
  }

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.displayValue = target.value;
    if (!this.displayValue.trim()) {
      this.gregorianValue = '';
      this.onChange('');
      return;
    }
    const latin = DateUtils.toLatinDigits(target.value);
    const normalized = DateUtils.normalizeJalaliInput(latin);
    if (!DateUtils.isJalaliFormat(normalized)) {
      return;
    }
    const [jy, jm, jd] = normalized.split('/').map((part) => Number(part));
    if (!DateUtils.isValidJalaliDate(jy, jm, jd)) {
      return;
    }
    const gregorian = DateUtils.toGregorian(normalized);
    if (!DateUtils.isValidGregorianDate(gregorian)) {
      return;
    }
    this.gregorianValue = gregorian;
    this.onChange(normalized);
    this.viewYear = jy;
    this.viewMonth = jm;
    this.rebuildCalendar();
  }

  selectDay(day: number | null): void {
    if (!day) {
      return;
    }
    const normalized = `${String(this.viewYear).padStart(4, '0')}/${String(this.viewMonth).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    const gregorian = DateUtils.toGregorian(normalized);
    if (!DateUtils.isValidGregorianDate(gregorian)) {
      return;
    }
    this.gregorianValue = gregorian;
    this.displayValue = DateUtils.toPersianDigits(normalized);
    this.onChange(normalized);
    this.onTouched();
    this.close();
  }

  prevMonth(): void {
    if (this.viewMonth === 1) {
      this.viewMonth = 12;
      this.viewYear -= 1;
    } else {
      this.viewMonth -= 1;
    }
    this.rebuildCalendar();
  }

  nextMonth(): void {
    if (this.viewMonth === 12) {
      this.viewMonth = 1;
      this.viewYear += 1;
    } else {
      this.viewMonth += 1;
    }
    this.rebuildCalendar();
  }

  onMonthChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.viewMonth = Number(target.value);
    this.rebuildCalendar();
  }

  onYearChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.viewYear = Number(target.value);
    this.rebuildCalendar();
  }

  isSelected(day: number | null): boolean {
    if (!day || !this.gregorianValue) {
      return false;
    }
    const selected = DateUtils.toJalali(this.gregorianValue);
    const formatted = `${String(this.viewYear).padStart(4, '0')}/${String(this.viewMonth).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    return selected === formatted;
  }

  isSelectedMonth(index: number): boolean {
    return this.viewMode === 'month' && this.viewMonth === index + 1;
  }

  isSelectedYear(year: number): boolean {
    return this.viewMode === 'year' && this.viewYear === year;
  }

  isToday(day: number | null): boolean {
    if (!day || !this.todayJalali) {
      return false;
    }
    const formatted = `${String(this.viewYear).padStart(4, '0')}/${String(this.viewMonth).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    return this.todayJalali === formatted;
  }

  formatDay(day: number): string {
    return DateUtils.toPersianDigits(String(day));
  }

  formatYear(year: number): string {
    return DateUtils.toPersianDigits(String(year));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('.jalali-picker')) {
      return;
    }
    this.close();
  }

  private rebuildCalendar(): void {
    const monthLength = DateUtils.jalaliMonthLength(this.viewYear, this.viewMonth);
    const firstWeekday = DateUtils.jalaliWeekday(this.viewYear, this.viewMonth, 1);
    const offset = (firstWeekday + 1) % 7; // align Saturday as first column
    const days: (number | null)[] = [];
    for (let i = 0; i < offset; i += 1) {
      days.push(null);
    }
    for (let day = 1; day <= monthLength; day += 1) {
      days.push(day);
    }
    while (days.length % 7 !== 0) {
      days.push(null);
    }
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    this.weeks = weeks;
  }

  prevPage(): void {
    if (this.viewMode === 'year') {
      this.viewYear -= 12;
      return;
    }
    if (this.viewMode === 'month') {
      this.viewYear -= 1;
      return;
    }
    this.prevMonth();
  }

  nextPage(): void {
    if (this.viewMode === 'year') {
      this.viewYear += 12;
      return;
    }
    if (this.viewMode === 'month') {
      this.viewYear += 1;
      return;
    }
    this.nextMonth();
  }

  showMonthView(): void {
    this.viewMode = 'month';
  }

  showYearView(): void {
    this.viewMode = 'year';
  }

  selectMonth(index: number): void {
    this.viewMonth = index + 1;
    this.viewMode = 'date';
    this.rebuildCalendar();
  }

  selectYear(year: number): void {
    this.viewYear = year;
    this.viewMode = 'month';
  }

  yearGrid(): number[] {
    const start = this.viewYear - (this.viewYear % 12);
    return Array.from({ length: 12 }, (_, idx) => start + idx);
  }

  private defaultGregorianDate(): string {
    const now = new Date();
    const fallback = new Date(Date.UTC(
      now.getUTCFullYear() - 18,
      now.getUTCMonth(),
      now.getUTCDate()
    ));
    return `${String(fallback.getUTCFullYear()).padStart(4, '0')}-${String(fallback.getUTCMonth() + 1).padStart(2, '0')}-${String(fallback.getUTCDate()).padStart(2, '0')}`;
  }
}
