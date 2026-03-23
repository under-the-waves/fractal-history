import { test, expect } from '@playwright/test';

// Helper: click the root tree node via data-testid
async function clickRootNode(page) {
  await page.locator('[data-testid="tree-node-0-ROOT"]').click();
}

// Helper: navigate to a narrative and wait for it to load.
// Uses direct URL to avoid tree interaction overhead.
async function navigateToNarrative(page) {
  await page.goto('/narrative/0-ROOT?breadth=A');
  await expect(page.getByText('Loading...')).toBeHidden({ timeout: 30000 });
}

// ---------------------------------------------------------------------------
// 1. Smoke tests -- each main page loads without JS errors
// ---------------------------------------------------------------------------
test.describe('Smoke tests', () => {
  for (const { path, heading } of [
    { path: '/', heading: 'Fractal History' },
    { path: '/tree', heading: 'Fractal History Tree' },
    { path: '/about', heading: 'About Fractal History' },
  ]) {
    test(`${path} loads without errors`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      expect(errors).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Tree expansion -- root node expands to show children
// ---------------------------------------------------------------------------
test('Tree view expands root node', async ({ page }) => {
  await page.goto('/tree');
  await clickRootNode(page);

  // At least 3 child nodes should appear
  const readButtons = page.getByText('Read →');
  await expect(readButtons.first()).toBeVisible();
  expect(await readButtons.count()).toBeGreaterThanOrEqual(3);
});

// ---------------------------------------------------------------------------
// 3. Narrative integrity -- article loads with content and footnotes
// ---------------------------------------------------------------------------
test('Narrative loads with article content and footnotes', async ({ page }) => {
  await navigateToNarrative(page);

  // Article element should exist with content
  const article = page.locator('article');
  await expect(article).toBeVisible();
  const text = await article.textContent();
  expect(text.length).toBeGreaterThan(500);

  // Should have at least one footnote link (superscript number)
  const footnotes = article.locator('a[href^="http"]');
  expect(await footnotes.count()).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// 4. Breadth toggle -- switching between Analytical and Temporal
// ---------------------------------------------------------------------------
test('Breadth toggle switches narrative content', async ({ page }) => {
  await navigateToNarrative(page);

  // Click Temporal anchors tab
  await page.getByRole('button', { name: 'Temporal anchors' }).click();

  // Wait for any loading
  await page.waitForTimeout(1000);
  const maybeLoading = page.getByText('Loading...');
  if (await maybeLoading.isVisible().catch(() => false)) {
    await expect(maybeLoading).toBeHidden({ timeout: 30000 });
  }

  // URL should reflect breadth=B
  await expect(page).toHaveURL(/breadth=B/);
});

// ---------------------------------------------------------------------------
// 5. Auth gate -- flashcard section shows sign-in prompt
// ---------------------------------------------------------------------------
test('Flashcard section shows sign-in prompt for unauthenticated user', async ({ page }) => {
  await navigateToNarrative(page);

  await expect(page.getByRole('button', { name: 'Sign in to save flashcards' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// 6. Responsive -- pages load at mobile and tablet widths
// ---------------------------------------------------------------------------
test.describe('Responsive', () => {
  for (const { name, width, height } of [
    { name: 'mobile (375px)', width: 375, height: 812 },
    { name: 'tablet (768px)', width: 768, height: 1024 },
  ]) {
    test(`pages load at ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });

      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));

      // Home
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Fractal History' })).toBeVisible();

      // Tree
      await page.goto('/tree');
      await expect(page.getByRole('heading', { name: 'Fractal History Tree' })).toBeVisible();

      // About
      await page.goto('/about');
      await expect(page.getByRole('heading', { name: 'About Fractal History' })).toBeVisible();

      expect(errors).toHaveLength(0);
    });
  }
});
