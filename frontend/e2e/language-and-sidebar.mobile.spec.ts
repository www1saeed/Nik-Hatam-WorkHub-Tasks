import { expect, test, Page } from '@playwright/test';

async function bootstrapAuthenticatedDashboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('nh_admin_token', 'e2e-token');
    localStorage.setItem('nh_admin_locale', 'en');
    localStorage.setItem('nh_admin_user', JSON.stringify({
      id: 1,
      username: 'admin',
      roles: [{ id: 1, name: 'Admin', slug: 'admin' }],
      permissions: []
    }));
  });

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: 1,
          username: 'admin',
          roles: [{ id: 1, name: 'Admin', slug: 'admin' }],
          permissions: []
        }
      })
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

test.describe('mobile language and sidebar behavior', () => {
  test('supports language and direction attributes on root html', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const html = page.locator('html');

    await expect(html).toHaveAttribute('lang', /fa|en/);
    await expect(html).toHaveAttribute('dir', /rtl|ltr/);
  });

  test('shows header sidebar toggle on dashboard', async ({ page }) => {
    await bootstrapAuthenticatedDashboard(page);
    await page.goto('/dashboard/users', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.app-header__menu-toggle')).toBeVisible();
  });

  test('opens and closes sidebar overlay from header toggle', async ({ page }) => {
    await bootstrapAuthenticatedDashboard(page);
    await page.goto('/dashboard/users', { waitUntil: 'domcontentloaded' });

    const sidebar = page.locator('.dashboard-shell__sidebar');
    const menuButton = page.locator('.app-header__menu-toggle');

    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(sidebar).toHaveClass(/is-open/);

    await page.locator('.dashboard-shell__close').click();
    await expect(sidebar).not.toHaveClass(/is-open/);
  });

  test('closes sidebar after navigation click on mobile', async ({ page }) => {
    await bootstrapAuthenticatedDashboard(page);
    await page.goto('/dashboard/users', { waitUntil: 'domcontentloaded' });

    await page.locator('.app-header__menu-toggle').click();
    await expect(page.locator('.dashboard-shell__sidebar')).toHaveClass(/is-open/);

    await page.locator('a[href="/profile"]').first().click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator('.app-header__menu-toggle')).toHaveCount(0);
  });

  test('language switch to fa applies rtl shell class on dashboard', async ({ page }) => {
    await bootstrapAuthenticatedDashboard(page);
    await page.goto('/dashboard/users', { waitUntil: 'domcontentloaded' });

    await page.locator('.app-header__menu-trigger').click();
    await page.locator('.app-header__menu-item:has-text("فارسی")').click();

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('.dashboard-shell')).toHaveClass(/is-rtl/);
  });
});
