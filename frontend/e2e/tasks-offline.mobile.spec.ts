import { expect, Page, test } from '@playwright/test';

async function bootstrapTaskSession(page: Page): Promise<void> {
  const user = {
    id: 19,
    username: 'staff.user',
    first_name: 'Staff',
    last_name: 'User',
    roles: [{ id: 3, name: 'Staff', slug: 'staff' }],
    permissions: [{ id: 100, name: 'Manage Tasks', slug: 'manage_tasks' }],
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

  await page.route('**/api/tasks/assignees', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 19,
            username: 'staff.user',
            first_name: 'Staff',
            last_name: 'User',
          },
        ],
      }),
    });
  });

  // Keep autocomplete stable in offline scenario.
  await page.route('**/api/task-templates**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/tasks?**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'failed to proxy / connection refused' }),
    });
  });
  await page.route('**/api/tasks', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'failed to proxy / connection refused' }),
    });
  });

  await page.route('**/api/notifications/unread-count', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { unread_count: 0 } }),
    });
  });
}

test.describe('mobile offline-first tasks', () => {
  test('can create task while backend is unavailable', async ({ page }) => {
    await bootstrapTaskSession(page);
    await page.goto('/dashboard/tasks/new', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'New daily responsibility' }).click();
    await page.fill('#modal-task-title', 'Offline Mobile Responsibility');
    await page.getByRole('button', { name: 'Capture task' }).click();

    await expect(page.locator('section.task-capture')).toContainText('Offline Mobile Responsibility');
    await expect(page.locator('section.task-capture')).toContainText('Pending sync');
  });
});

