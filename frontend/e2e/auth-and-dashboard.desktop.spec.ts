import { expect, Page, test } from '@playwright/test';

async function forceEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('nh_admin_locale', 'en');
  });
}

test.describe('desktop auth and dashboard journeys', () => {
  test('guest can open login and register pages', async ({ page }) => {
    await forceEnglish(page);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('form')).toBeVisible();

    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('form')).toBeVisible();
  });

  test('dashboard route redirects unauthenticated users to login', async ({ page }) => {
    await forceEnglish(page);
    await page.goto('/dashboard/users', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login$/);
  });

  test('shows mapped error for invalid credentials on login', async ({ page }) => {
    await forceEnglish(page);
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'The provided credentials are incorrect.' }),
      });
    });

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[formcontrolname="login"]', 'wrong-user');
    await page.fill('input[formcontrolname="password"]', 'wrong-password');
    await page.click('button[type="submit"]');

    await expect(page.locator('.auth__error')).toContainText('The provided credentials are incorrect.');
  });

  test('shows mapped error for unverified email on login', async ({ page }) => {
    await forceEnglish(page);
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Please verify your email address before logging in.' }),
      });
    });

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[formcontrolname="login"]', 'user@example.com');
    await page.fill('input[formcontrolname="password"]', 'AnyPassword123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('.auth__error')).toContainText('Please verify your email address before logging in.');
  });

  test('shows register duplicate-email warning block', async ({ page }) => {
    await forceEnglish(page);
    await page.route('**/api/auth/register', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'The email has already been taken.',
          errors: {
            email: ['The email has already been taken.'],
          },
        }),
      });
    });

    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.fill('input[formcontrolname="first_name"]', 'Saeed');
    await page.fill('input[formcontrolname="last_name"]', 'Hatami');
    await page.fill('input[formcontrolname="email"]', 'taken@example.com');
    await page.fill('input[formcontrolname="username"]', 'saeedhatami');
    await page.fill('input[formcontrolname="password"]', 'StrongPass123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('.auth__notice--warning')).toBeVisible();
    await expect(page.locator('.auth__notice--warning')).toContainText('taken@example.com');
  });
});
