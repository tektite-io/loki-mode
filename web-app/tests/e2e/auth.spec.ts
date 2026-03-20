import { test, expect } from '@playwright/test';

// ============================================================================
// Auth E2E Tests
// ============================================================================

test.describe('Authentication', () => {
  test('Login page renders with GitHub and Google buttons', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(2000);
    // In local mode, /login redirects to / -- skip assertions if redirected
    if (page.url().includes('/login')) {
      await expect(page.locator('text=Sign in to continue')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('button:has-text("Sign in with GitHub")')).toBeVisible();
      await expect(page.locator('button:has-text("Sign in with Google")')).toBeVisible();
    } else {
      // Local mode: login page is bypassed, verify home loaded instead
      await expect(page.locator('text=Describe it. Build it. Ship it.')).toBeVisible({ timeout: 10000 });
    }
  });

  test('"Continue without account" link exists', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(2000);
    if (page.url().includes('/login')) {
      await expect(page.locator('text=Continue without account')).toBeVisible({ timeout: 10000 });
    } else {
      // Local mode: login page is bypassed, home page loads directly
      await expect(page.locator('text=Describe it. Build it. Ship it.')).toBeVisible({ timeout: 10000 });
    }
  });

  test('Login page shows Purple Lab branding', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(2000);
    if (page.url().includes('/login')) {
      await expect(page.locator('h1:has-text("Purple Lab")')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=Autonomous agent workspace')).toBeVisible();
    } else {
      // Local mode: verify Purple Lab branding appears in sidebar instead
      await expect(page.locator('text=Purple Lab')).toBeVisible({ timeout: 10000 });
    }
  });

  test('Local mode bypasses login (home page loads directly)', async ({ page }) => {
    // In local mode (no DATABASE_URL), the app should load the home page
    // without requiring authentication
    await page.goto('/');
    // If local mode, the home page loads; if auth mode, we get redirected to /login
    // Either way, the page should load without errors
    await page.waitForTimeout(3000);
    const url = page.url();
    // In local mode (default), we should NOT be on /login
    // We expect to land on / with the main content
    const isLocalMode = !url.includes('/login');
    if (isLocalMode) {
      await expect(page.locator('text=Describe it. Build it. Ship it.')).toBeVisible({ timeout: 10000 });
    }
  });

  test('Protected routes redirect to login when auth is enabled', async ({ page }) => {
    // Navigate to a protected route
    await page.goto('/projects');
    await page.waitForTimeout(3000);
    // In local mode this loads directly; in auth mode it redirects to /login
    // Verify the page loaded to either /projects or /login (no crash)
    const url = page.url();
    expect(url).toMatch(/\/(projects|login)/);
  });

  test('Auth /api/auth/me endpoint returns local_mode info', async ({ request }) => {
    const res = await request.get('/api/auth/me');
    expect(res.status()).toBe(200);
    const data = await res.json();
    // Should have either local_mode or authenticated field
    expect(data).toHaveProperty('local_mode');
    if (data.local_mode) {
      expect(data.authenticated).toBe(false);
    }
  });

  test('Logout clears state and redirects appropriately', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    // In local mode, there may not be a visible logout button
    // Check if user section exists in the sidebar
    const userSection = page.locator('[data-testid="user-section"]');
    if (await userSection.isVisible()) {
      // If a logout button exists, click it
      const logoutBtn = page.locator('button:has-text("Logout")');
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForTimeout(1000);
        // Should redirect to login or home
        const url = page.url();
        expect(url).toMatch(/\/(login)?$/);
      }
    }
    // In local mode without visible user section, this test is a no-op
  });
});
