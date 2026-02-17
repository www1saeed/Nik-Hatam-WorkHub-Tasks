import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/services/auth.service';
import { AdminUser, AdminUsersService } from '../../core/services/admin-users.service';
import { TaskItem, TasksService } from '../../core/services/tasks.service';
import { LanguageService } from '../../core/services/language.service';
import { TaskDateTimeUtils } from '../../core/utils/task-datetime.util';
import { DateUtils } from '../../core/utils/date-utils';
import { parseHttpError } from '../../core/utils/error-mapper';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly adminUsersService = inject(AdminUsersService);
  private readonly tasksService = inject(TasksService);
  private readonly languageService = inject(LanguageService);
  private readonly cdr = inject(ChangeDetectorRef);

  isLoading = true;
  errorMessage = '';

  myOpenTasks: TaskItem[] = [];

  recentUsers: AdminUser[] = [];
  totalUsersCount = 0;

  todayDoneTasks: TaskItem[] = [];
  private readonly collapsedSections: Record<'my_open_tasks' | 'latest_users' | 'today_done_tasks', boolean> = {
    my_open_tasks: false,
    latest_users: false,
    today_done_tasks: false,
  };

  constructor() {
    // Dashboard is data-driven and role-aware.
    // We fetch only the blocks the current user is permitted to see.
    void this.loadDashboard();
  }

  /**
   * Whether current user can access task modules.
   */
  get canAccessTasks(): boolean {
    return this.authService.hasPermission('manage_tasks') || this.authService.hasPermission('manage_staffs');
  }

  /**
   * Whether current user can access user-management data.
   */
  get canManageUsers(): boolean {
    return this.authService.hasPermission('manage_users');
  }

  /**
   * Whether current user can see staff-wide task blocks.
   */
  get canManageStaffs(): boolean {
    return this.authService.hasPermission('manage_staffs');
  }

  /**
   * Human-readable open-task count label.
   */
  get myOpenTasksCountLabel(): string {
    const text = String(this.myOpenTasks.length);
    return this.languageService.getLanguage() === 'fa' ? DateUtils.toPersianDigits(text) : text;
  }

  /**
   * Total users badge label with locale-aware digits.
   */
  get usersTotalLabel(): string {
    const text = String(this.totalUsersCount);
    return this.languageService.getLanguage() === 'fa' ? DateUtils.toPersianDigits(text) : text;
  }

  /**
   * Today's completed tasks count label with locale-aware digits.
   */
  get todayDoneTasksCountLabel(): string {
    const text = String(this.todayDoneTasks.length);
    return this.languageService.getLanguage() === 'fa' ? DateUtils.toPersianDigits(text) : text;
  }

  /**
   * Format task datetime for dashboard list rows.
   */
  formatTaskDateTime(iso: string | null | undefined): string {
    if (!iso) {
      return '-';
    }
    return TaskDateTimeUtils.formatDateTime(iso, this.languageService.getLanguage());
  }

  /**
   * Build display name with username fallback.
   */
  userLabel(user: Pick<AdminUser, 'first_name' | 'last_name' | 'username'>): string {
    return `${user.first_name} ${user.last_name}`.trim() || user.username;
  }

  /**
   * Build assignee summary for compact done-task rows.
   */
  doneTaskAssignees(task: TaskItem): string {
    const users = task.assigned_users ?? [];
    if (users.length === 0) {
      return '-';
    }

    return users.map((user) => this.taskUserLabel(user)).join('، ');
  }

  /**
   * Return collapsed/expanded state for one dashboard card.
   */
  isSectionCollapsed(section: 'my_open_tasks' | 'latest_users' | 'today_done_tasks'): boolean {
    return this.collapsedSections[section];
  }

  /**
   * Toggle one dashboard card like an accordion section.
   */
  toggleSection(section: 'my_open_tasks' | 'latest_users' | 'today_done_tasks'): void {
    this.collapsedSections[section] = !this.collapsedSections[section];
  }

  /**
   * Build display name for task assignee/creator records.
   */
  taskUserLabel(user: { first_name: string; last_name: string; username: string }): string {
    return `${user.first_name} ${user.last_name}`.trim() || user.username;
  }

  /**
   * Load all dashboard sections in parallel based on permissions.
   */
  private async loadDashboard(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const tasksPromise = this.canAccessTasks ? this.tasksService.list() : Promise.resolve([] as TaskItem[]);
      const usersPromise = this.canManageUsers ? this.adminUsersService.list() : Promise.resolve([] as AdminUser[]);

      const [tasks, users] = await Promise.all([tasksPromise, usersPromise]);

      this.applyTaskBlocks(tasks);
      this.applyUsersBlock(users);
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Derive all task-based dashboard sections from one task list payload.
   */
  private applyTaskBlocks(tasks: TaskItem[]): void {
    const currentUserId = Number(this.authService.currentUserValue()?.id ?? 0);

    // "My tasks" rule:
    // - created by me
    // - OR assigned to me
    const myTasks = tasks.filter((task) =>
      task.created_by === currentUserId
      || (task.assigned_users ?? []).some((user) => user.id === currentUserId)
    );

    // First 10 of my not-done tasks, sorted by planned start (or created_at fallback).
    this.myOpenTasks = myTasks
      .filter((task) => task.status !== 'done')
      .sort((a, b) => this.taskSortTime(a) - this.taskSortTime(b))
      .slice(0, 10);

    // Manager/staff overview: latest today's done tasks (10 items).
    // "Today" is evaluated in Tehran business timezone for consistency with task module.
    if (this.canManageStaffs) {
      const todayKey = this.toTehranDateKey(new Date().toISOString());
      this.todayDoneTasks = tasks
        .filter((task) => task.status === 'done')
        .filter((task) => this.toTehranDateKey(task.ends_at ?? task.updated_at) === todayKey)
        .sort((a, b) => this.taskCompletionSortTime(b) - this.taskCompletionSortTime(a))
        .slice(0, 10);
    } else {
      this.todayDoneTasks = [];
    }
  }

  /**
   * Derive user-management dashboard section.
   */
  private applyUsersBlock(users: AdminUser[]): void {
    // User list API already comes sorted by latest registration (id desc).
    this.totalUsersCount = users.length;
    this.recentUsers = users.slice(0, 10);
  }

  /**
   * Stable sort key for open-task list.
   */
  private taskSortTime(task: TaskItem): number {
    const iso = task.starts_at ?? task.created_at;
    return new Date(iso).getTime();
  }

  /**
   * Stable sort key for completed-task list (latest first).
   */
  private taskCompletionSortTime(task: TaskItem): number {
    const iso = task.ends_at ?? task.updated_at;
    return new Date(iso).getTime();
  }

  /**
   * Convert ISO datetime to Tehran date key (`YYYY-MM-DD`) for "today" checks.
   */
  private toTehranDateKey(iso: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(iso));

    const read = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? '';

    return `${read('year')}-${read('month')}-${read('day')}`;
  }
}
