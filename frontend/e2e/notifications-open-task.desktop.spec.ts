import { expect, Page, test } from '@playwright/test';

async function bootstrapNotificationsSession(page: Page): Promise<void> {
  const user = {
    id: 31,
    username: 'manager.user',
    first_name: 'Manager',
    last_name: 'User',
    roles: [{ id: 1, name: 'Manager', slug: 'manager' }],
    permissions: [{ id: 10, name: 'Manage Tasks', slug: 'manage_tasks' }],
  };

  await page.addInitScript((payload) => {
    localStorage.setItem('nh_admin_locale', 'en');
    localStorage.setItem('nh_admin_token', 'e2e-token');
    localStorage.setItem('nh_admin_user', JSON.stringify(payload));
  }, user);

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: user }),
    });
  });

  await page.route('**/api/notifications/unread-count', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { unread_count: 1 } }),
    });
  });

  await page.route('**/api/notifications?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'notif-1',
            event: 'task_assigned',
            task_id: 123,
            task_title: 'Open task from notification',
            actor: { id: 99, name: 'Admin', username: 'admin' },
            comment_excerpt: null,
            is_read: false,
            read_at: null,
            created_at: '2026-02-17T10:00:00Z',
          },
        ],
        meta: { unread_count: 1 },
      }),
    });
  });

  await page.route('**/api/notifications/notif-1/read', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: 'notif-1',
          event: 'task_assigned',
          task_id: 123,
          task_title: 'Open task from notification',
          actor: { id: 99, name: 'Admin', username: 'admin' },
          comment_excerpt: null,
          is_read: true,
          read_at: '2026-02-17T10:01:00Z',
          created_at: '2026-02-17T10:00:00Z',
        },
        meta: { unread_count: 0 },
      }),
    });
  });

  await page.route('**/api/tasks/assignees', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{ id: 31, username: 'manager.user', first_name: 'Manager', last_name: 'User' }],
      }),
    });
  });

  await page.route('**/api/task-templates**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/tasks?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 123,
            title: 'Open task from notification',
            status: 'open',
            starts_at: '2026-02-17T09:00:00Z',
            ends_at: null,
            created_at: '2026-02-17T09:00:00Z',
            updated_at: '2026-02-17T09:00:00Z',
            can_edit: true,
            can_delete: true,
            can_mark_done: true,
            assigned_users: [{ id: 31, first_name: 'Manager', last_name: 'User', username: 'manager.user' }],
            comments: [],
            attachments: [],
            creator: { id: 31, first_name: 'Manager', last_name: 'User', username: 'manager.user' },
          },
        ],
      }),
    });
  });

  await page.route('**/api/tasks/123', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: 123,
          title: 'Open task from notification',
          status: 'open',
          starts_at: '2026-02-17T09:00:00Z',
          ends_at: null,
          created_at: '2026-02-17T09:00:00Z',
          updated_at: '2026-02-17T09:00:00Z',
          can_edit: true,
          can_delete: true,
          can_mark_done: true,
          assigned_users: [{ id: 31, first_name: 'Manager', last_name: 'User', username: 'manager.user' }],
          comments: [],
          attachments: [],
          creator: { id: 31, first_name: 'Manager', last_name: 'User', username: 'manager.user' },
        },
      }),
    });
  });
}

test.describe('desktop notifications deep-link', () => {
  test('clicking a task notification opens task detail modal on tasks page', async ({ page }) => {
    await bootstrapNotificationsSession(page);
    await page.goto('/dashboard/notifications', { waitUntil: 'domcontentloaded' });

    await page.locator('.notifications-page__item').first().click();
    await expect(page).toHaveURL(/\/dashboard\/tasks\/new$/);
    await expect(page.getByRole('dialog', { name: /daily responsibility details/i })).toBeVisible();
    await expect(page.locator('.task-capture__detail h3')).toHaveText('Open task from notification');
  });
});
