/**
 * NON-PERSISTENT / MEMORY-MODE E2E
 *
 * This suite uses ADP_RESEARCH_PROVIDER=memory and an in-process InMemoryJobDispatcher.
 * It does NOT prove PostgreSQL persistence across process restarts.
 * See e2e/research-postgres-persistent-workflow.spec.ts for the controlled-pilot gate.
 */
import { expect, test } from '@playwright/test';

test.describe('Phase 1.1 research fixture workflow (memory / non-persistent)', () => {
  test('import → resolution → collection → review → evidence/variable → dashboard', async ({
    page,
  }) => {
    await page.goto('/research');
    await expect(page.getByTestId('research-hub')).toBeVisible();

    await page.getByTestId('reset-fixture-runtime').click();
    await expect(page.getByTestId('population-imports')).toBeVisible();

    await page.getByTestId('import-universe').click();
    await expect(page.getByTestId('entity-resolution')).toBeVisible();
    await expect(page.getByTestId('candidate-count')).toContainText(/Candidates:\s*[1-9]/);
    await expect(page.getByTestId('organization-count')).toContainText(/Organizations:\s*[1-9]/);

    await page.getByTestId('resolve-entities').click();
    await expect(page.getByTestId('research-priorities')).toBeVisible();

    await page.getByTestId('calculate-priorities').click();
    await expect(page.getByTestId('collection-jobs')).toBeVisible();

    await page.getByTestId('start-collection-run').click();
    await expect(page.getByTestId('collection-job-detail')).toBeVisible();
    await expect(page.getByTestId('collection-run-status')).toHaveText(/completed|blocked/);

    await page.goto('/research/extraction-review');
    await expect(page.getByTestId('extraction-review')).toBeVisible();
    await expect(page.getByTestId('proposed-claim-count')).toContainText(
      /Proposed claims:\s*[1-9]/,
    );

    const acceptButton = page.locator('[data-testid^="accept-claim-"]').first();
    await expect(acceptButton).toBeVisible();
    await acceptButton.click();

    await expect(page.getByTestId('research-coverage-dashboard')).toBeVisible();
    await expect(page.getByTestId('claim-accepted-banner')).toBeVisible();
    await expect(page.getByTestId('dash-claims-accepted')).toHaveText(/[1-9]/);
    await expect(page.getByTestId('dash-evidence-ready')).toHaveText('ready');
    await expect(page.getByTestId('dash-score-recalcs')).toHaveText(/[1-9]/);

    await page.goto('/research');
    await expect(page.getByTestId('metric-claims-accepted')).toHaveText(/[1-9]/);
    await expect(page.getByTestId('metric-score-recalcs')).toHaveText(/[1-9]/);
  });
});
