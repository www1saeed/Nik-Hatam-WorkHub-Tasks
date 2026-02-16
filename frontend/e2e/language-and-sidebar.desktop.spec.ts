import { expect, test } from '@playwright/test';

async function bootstrapDashboardSession(page: import('@playwright/test').Page, user: Record<string, unknown>): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('nh_admin_token', 'e2e-token');
    localStorage.setItem('nh_admin_user', JSON.stringify(payload));
  }, user);

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: user })
    });
  });
  await page.route('**/api/users', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] })
    });
  });
  await page.route('**/api/roles', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] })
    });
  });
  await page.route('**/api/permissions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] })
    });
  });
  await page.route('**/api/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          username: 'admin',
          first_name: 'Admin',
          last_name: 'User',
          email: 'admin@test.dev',
          phone_numbers: [],
          addresses: []
        }
      })
    });
  });
  await page.route('**/api/auth/logout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({})
    });
  });
}

test.describe('desktop language and shell behavior', () => {
  test('supports language and direction attributes on root html', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const html = page.locator('html');

    await expect(html).toHaveAttribute('lang', /fa|en/);
    await expect(html).toHaveAttribute('dir', /rtl|ltr/);
  });

  test('admin sees full access-control section and can collapse sidebar', async ({ page }) => {
    await bootstrapDashboardSession(page, {
      id: 1,
      username: 'admin',
      roles: [{ id: 1, name: 'Admin', slug: 'admin' }],
      permissions: []
    });

    await page.goto('/dashboard/users', { waitUntil: 'domcontentloaded' });
    const shell = page.locator('.dashboard-shell');
    const collapse = page.locator('.dashboard-shell__collapse');

    await expect(page.locator('a[href="/dashboard/users"]')).toBeVisible();
    await expect(page.locator('a[href="/dashboard/roles"]')).toBeVisible();
    await expect(page.locator('a[href="/dashboard/permissions"]')).toBeVisible();

    await collapse.click();
    await expect(shell).toHaveClass(/is-collapsed/);
    await collapse.click();
    await expect(shell).not.toHaveClass(/is-collapsed/);
  });

  test('limited user only sees authorized menu entries', async ({ page }) => {
    await bootstrapDashboardSession(page, {
      id: 2,
      username: 'manager',
      roles: [{ id: 2, name: 'Manager', slug: 'manager' }],
      permissions: [{ id: 11, name: 'Manage Users', slug: 'manage_users' }]
    });

    await page.goto('/dashboard/users', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('a[href="/dashboard/users"]')).toBeVisible();
    await expect(page.locator('a[href="/dashboard/roles"]')).toHaveCount(0);
    await expect(page.locator('a[href="/dashboard/permissions"]')).toHaveCount(0);
  });
});
