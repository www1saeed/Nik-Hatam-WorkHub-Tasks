import { TaskItem } from '../services/tasks.service';

/**
 * Shared helpers for task-title suggestion behavior.
 *
 * Goals:
 * - keep autocomplete ranking identical across task pages
 * - reuse "recent own titles" logic for empty-query dropdown state
 */
export class TaskTemplateSuggestionsUtils {
  /**
   * Rank titles by query match quality.
   *
   * Order:
   * 1) titles starting with query
   * 2) titles containing query at non-zero position
   */
  static rankTitlesByPrefix(query: string, titles: string[]): string[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      return titles;
    }

    const startsWithMatches: string[] = [];
    const containsMatches: string[] = [];

    for (const title of titles) {
      const normalizedTitle = title.toLocaleLowerCase();
      if (normalizedTitle.startsWith(normalizedQuery)) {
        startsWithMatches.push(title);
      } else {
        containsMatches.push(title);
      }
    }

    return [...startsWithMatches, ...containsMatches];
  }

  /**
   * Build recent unique task titles created by one user.
   *
   * Constraints:
   * - newest first by updated/created timestamp
   * - unique non-empty titles only
   * - capped by `limit`
   */
  static buildRecentOwnTitles(tasks: TaskItem[], currentUserId: number, limit = 10): string[] {
    if (currentUserId <= 0) {
      return [];
    }

    const ownTasks = tasks
      .filter((task) => task.created_by === currentUserId)
      .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());

    const seen = new Set<string>();
    const titles: string[] = [];

    for (const task of ownTasks) {
      const title = task.title.trim();
      if (!title || seen.has(title)) {
        continue;
      }
      seen.add(title);
      titles.push(title);
      if (titles.length >= limit) {
        break;
      }
    }

    return titles;
  }
}
