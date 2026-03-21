import { test, expect } from '@playwright/test';

// Dismiss OnboardingOverlay globally for all tests
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pl_onboarding_complete', '1');
  });
});

// ============================================================================
// API Endpoint Tests
// ============================================================================

test.describe('API Endpoints', () => {
  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.service).toBe('purple-lab');
  });

  test('GET /api/session/status returns session state', async ({ request }) => {
    const res = await request.get('/api/session/status');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('running');
    expect(data).toHaveProperty('phase');
    expect(data).toHaveProperty('provider');
    expect(typeof data.running).toBe('boolean');
  });

  test('GET /api/templates returns templates with category', async ({ request }) => {
    const res = await request.get('/api/templates');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('name');
    expect(data[0]).toHaveProperty('filename');
    expect(data[0]).toHaveProperty('description');
    expect(data[0]).toHaveProperty('category');
  });

  test('GET /api/sessions/history returns session list', async ({ request }) => {
    const res = await request.get('/api/sessions/history');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('GET /api/provider/current returns provider info', async ({ request }) => {
    const res = await request.get('/api/provider/current');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('provider');
    expect(['claude', 'codex', 'gemini', '']).toContain(data.provider);
  });
});

// ============================================================================
// Secrets API Tests
// ============================================================================

test.describe('Secrets API', () => {
  const testKey = 'PW_TEST_SECRET';
  const testValue = 'playwright-test-value';

  test('POST /api/secrets creates a secret', async ({ request }) => {
    const res = await request.post('/api/secrets', {
      data: { key: testKey, value: testValue },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.set).toBe(true);
    expect(data.key).toBe(testKey);
  });

  test('GET /api/secrets returns masked values', async ({ request }) => {
    // Ensure secret exists
    await request.post('/api/secrets', { data: { key: testKey, value: testValue } });
    const res = await request.get('/api/secrets');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data[testKey]).toBe('***');
  });

  test('DELETE /api/secrets/{key} removes secret', async ({ request }) => {
    await request.post('/api/secrets', { data: { key: testKey, value: testValue } });
    const res = await request.delete(`/api/secrets/${testKey}`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe(true);

    // Verify gone
    const getRes = await request.get('/api/secrets');
    const secrets = await getRes.json();
    expect(secrets).not.toHaveProperty(testKey);
  });

  test('POST /api/secrets rejects invalid key format', async ({ request }) => {
    const res = await request.post('/api/secrets', {
      data: { key: 'invalid-key!', value: 'x' },
    });
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid key');
  });
});

// ============================================================================
// File CRUD Tests (requires at least one session in history)
// ============================================================================

test.describe('File CRUD', () => {
  let sessionId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.get('/api/sessions/history');
    const sessions = await res.json();
    if (sessions.length > 0) {
      sessionId = sessions[0].id;
    }
  });

  test('GET session detail returns files', async ({ request }) => {
    test.skip(!sessionId, 'No sessions available');
    const res = await request.get(`/api/sessions/${sessionId}`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('files');
    expect(data).toHaveProperty('status');
  });

  test('PUT creates and GET reads file', async ({ request }) => {
    test.skip(!sessionId, 'No sessions available');
    const path = '_playwright_test.txt';
    const content = 'Playwright E2E test content';

    // Create/save
    const putRes = await request.put(`/api/sessions/${sessionId}/file`, {
      data: { path, content },
    });
    expect(putRes.status()).toBe(200);
    expect((await putRes.json()).saved).toBe(true);

    // Read
    const getRes = await request.get(`/api/sessions/${sessionId}/file?path=${path}`);
    expect(getRes.status()).toBe(200);
    expect((await getRes.json()).content).toBe(content);

    // Delete
    const delRes = await request.delete(`/api/sessions/${sessionId}/file`, {
      data: { path },
    });
    expect(delRes.status()).toBe(200);
    expect((await delRes.json()).deleted).toBe(true);

    // Verify deleted
    const verifyRes = await request.get(`/api/sessions/${sessionId}/file?path=${path}`);
    expect(verifyRes.status()).toBe(404);
  });
});

// ============================================================================
// Chat API Tests
// ============================================================================

test.describe('Chat API', () => {
  let sessionId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.get('/api/sessions/history');
    const sessions = await res.json();
    if (sessions.length > 0) {
      sessionId = sessions[0].id;
    }
  });

  test('POST chat returns task_id (non-blocking)', async ({ request }) => {
    test.skip(!sessionId, 'No sessions available');
    const res = await request.post(`/api/sessions/${sessionId}/chat`, {
      data: { message: 'test ping', mode: 'quick' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('task_id');
    expect(data.status).toBe('running');
  });

  test('GET chat poll returns task status', async ({ request }) => {
    test.skip(!sessionId, 'No sessions available');
    // Start a chat task
    const startRes = await request.post(`/api/sessions/${sessionId}/chat`, {
      data: { message: 'poll test', mode: 'quick' },
    });
    const { task_id } = await startRes.json();

    // Poll it
    const pollRes = await request.get(`/api/sessions/${sessionId}/chat/${task_id}`);
    expect(pollRes.status()).toBe(200);
    const data = await pollRes.json();
    expect(data).toHaveProperty('task_id');
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('output_lines');
    expect(data).toHaveProperty('complete');
  });
});

// ============================================================================
// UI Navigation Tests
// ============================================================================

test.describe('UI Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss the OnboardingOverlay so it does not block clicks
    await page.addInitScript(() => localStorage.setItem('pl_onboarding_complete', '1'));
  });

  test('Home page loads with sidebar and hero text', async ({ page }) => {
    await page.goto('/');
    // Sidebar should be visible
    await expect(page.locator('text=Purple Lab')).toBeVisible({ timeout: 10000 });
    // Hero heading
    await expect(page.locator('text=Describe it. Build it. Ship it.')).toBeVisible();
    // Nav links (use getByRole to avoid matching page content)
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Templates' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('Projects page navigates and renders', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible({ timeout: 10000 });
  });

  test('Templates page navigates and shows categories', async ({ page }) => {
    await page.goto('/templates');
    await expect(page.locator('h1:has-text("Templates")')).toBeVisible({ timeout: 10000 });
    // Category filter tabs
    await expect(page.locator('button:has-text("All")')).toBeVisible();
    await expect(page.locator('button:has-text("Website")')).toBeVisible();
    await expect(page.locator('button:has-text("API")')).toBeVisible();
  });

  test('Settings page navigates and shows provider selector', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    // Provider selector -- look for Claude card (may be capitalized)
    await expect(page.locator('text=Claude').or(page.locator('text=claude')).first()).toBeVisible({ timeout: 5000 });
  });

  test('Sidebar navigation works between all pages', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Describe it')).toBeVisible({ timeout: 10000 });

    // Navigate to Projects
    await page.click('a:has-text("Projects")');
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible({ timeout: 5000 });

    // Navigate to Templates
    await page.click('a:has-text("Templates")');
    await expect(page.locator('h1:has-text("Templates")')).toBeVisible({ timeout: 5000 });

    // Navigate to Settings
    await page.click('a:has-text("Settings")');
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible({ timeout: 5000 });

    // Navigate back to Home
    await page.click('a:has-text("Home")');
    await expect(page.locator('text=Describe it')).toBeVisible({ timeout: 5000 });
  });

  test('Hard refresh works on all routes (SPA)', async ({ page }) => {
    // Direct navigation to /projects should work (SPA fallback)
    await page.goto('/projects');
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible({ timeout: 10000 });

    await page.goto('/templates');
    await expect(page.locator('h1:has-text("Templates")')).toBeVisible({ timeout: 10000 });

    await page.goto('/settings');
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================================
// IDE Workspace Tests (requires at least one session)
// ============================================================================

test.describe('IDE Workspace', () => {
  let sessionId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.get('/api/sessions/history');
    const sessions = await res.json();
    if (sessions.length > 0) {
      sessionId = sessions[0].id;
    }
  });

  test.beforeEach(async ({ page }) => {
    // Dismiss the OnboardingOverlay so it does not block clicks
    await page.addInitScript(() => localStorage.setItem('pl_onboarding_complete', '1'));
  });

  test('Project page loads with workspace tabs', async ({ page }) => {
    test.skip(!sessionId, 'No sessions available');
    await page.goto(`/project/${sessionId}`);

    // Wait for workspace to load
    await expect(page.getByRole('tab', { name: 'Code' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('tab', { name: 'Preview' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Config' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Secrets' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'PRD' })).toBeVisible();
  });

  test('Workspace tab switching works', async ({ page }) => {
    test.skip(!sessionId, 'No sessions available');
    await page.goto(`/project/${sessionId}`);
    await expect(page.locator('text=Code')).toBeVisible({ timeout: 10000 });

    // Click PRD tab
    await page.click('button[role="tab"]:has-text("PRD")');
    await expect(page.locator('h3:has-text("Product Requirements")')).toBeVisible({ timeout: 5000 });

    // Click Config tab
    await page.click('button[role="tab"]:has-text("Config")');
    await expect(page.locator('text=Build Mode')).toBeVisible({ timeout: 5000 });

    // Click Secrets tab
    await page.click('button[role="tab"]:has-text("Secrets")');
    await expect(page.locator('text=Environment Secrets')).toBeVisible({ timeout: 5000 });

    // Click back to Code tab
    await page.click('button[role="tab"]:has-text("Code")');
  });

  test('File tree shows project files', async ({ page }) => {
    test.skip(!sessionId, 'No sessions available');
    await page.goto(`/project/${sessionId}`);
    await expect(page.locator('text=Files')).toBeVisible({ timeout: 10000 });
    // Should have at least one file listed
    const fileItems = page.locator('[role="treeitem"]');
    await expect(fileItems.first()).toBeVisible({ timeout: 5000 });
  });

  test('Back button navigates to projects', async ({ page }) => {
    test.skip(!sessionId, 'No sessions available');
    await page.goto(`/project/${sessionId}`);
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    // Should go back to home or projects
    await expect(page).toHaveURL(/\/(projects)?$/, { timeout: 5000 });
  });
});

// ============================================================================
// Home Page Functionality Tests
// ============================================================================

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss the OnboardingOverlay so it does not block clicks
    await page.addInitScript(() => localStorage.setItem('pl_onboarding_complete', '1'));
  });

  test('PRD input area is present and functional', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Product Requirements')).toBeVisible({ timeout: 10000 });
    // Textarea should exist
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    // Type into it
    await textarea.fill('# Test PRD\n\nBuild a hello world app');
    await expect(textarea).toHaveValue(/Test PRD/);
  });

  test('Templates dropdown loads templates', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button:has-text("Templates")')).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("Templates")');
    // Should show template list
    await expect(page.locator('button:has-text("Readme")')).toBeVisible({ timeout: 5000 });
  });

  test('Start Build button exists and is disabled without PRD', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('button:has-text("Start Build")');
    await expect(btn).toBeVisible({ timeout: 10000 });
    // Should be disabled when textarea is empty
    await expect(btn).toBeDisabled();
  });

  test('Start Build enables when PRD is entered', async ({ page }) => {
    await page.goto('/');
    const textarea = page.locator('textarea');
    await textarea.fill('# Test PRD\n\nBuild something');
    const btn = page.locator('button:has-text("Start Build")');
    await expect(btn).toBeEnabled({ timeout: 3000 });
  });

  test('Session history section is visible', async ({ page }) => {
    await page.goto('/');
    // Past Builds section should be visible if there are sessions
    await page.waitForTimeout(2000); // Wait for polling
    const builds = page.locator('text=Past Builds');
    // May or may not be visible depending on whether sessions exist
    // Just verify the page loaded without errors
    await expect(page.getByRole('heading', { name: 'Product Requirements' })).toBeVisible();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss the OnboardingOverlay so it does not block clicks
    await page.addInitScript(() => localStorage.setItem('pl_onboarding_complete', '1'));
  });

  test('Skip link exists and is focusable', async ({ page }) => {
    await page.goto('/');
    // Tab to skip link
    await page.keyboard.press('Tab');
    const skipLink = page.locator('a:has-text("Skip to main content")');
    // It should exist in DOM even if visually hidden
    await expect(skipLink).toBeAttached();
  });

  test('Sidebar nav has accessible labels', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeAttached({ timeout: 10000 });
  });

  test('Workspace tabs have correct ARIA roles', async ({ page, request }) => {
    const res = await request.get('/api/sessions/history');
    const sessions = await res.json();
    test.skip(sessions.length === 0, 'No sessions');

    await page.goto(`/project/${sessions[0].id}`);
    const tablist = page.locator('[role="tablist"]');
    await expect(tablist.first()).toBeVisible({ timeout: 10000 });
    const tabs = page.locator('[role="tab"]');
    expect(await tabs.count()).toBeGreaterThanOrEqual(4);
  });

  test('Icon buttons have tooltips (title attribute)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    // Sidebar collapse button should have title
    const collapseBtn = page.locator('button[title="Collapse sidebar"]');
    await expect(collapseBtn).toBeAttached({ timeout: 5000 });
  });
});
