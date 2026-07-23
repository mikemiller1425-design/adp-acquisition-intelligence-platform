/**
 * Phase 1.2 research-run orchestration E2E (MEMORY PROVIDER)
 *
 * Uses ADP_RESEARCH_PROVIDER=memory via playwright.config.ts.
 * Does NOT enable ADP_LIVE_RESEARCH_ENABLED.
 * Flow: configure → preview (gates ok for fixture) → launch → monitor → pause → resume → complete.
 *
 * See research-fixture-workflow.spec.ts for Phase 1.1 memory workflow.
 * See research-postgres-persistent-workflow.spec.ts for PG persistence gate.
 */
import { expect, test } from '@playwright/test';

test.describe('Phase 1.2 research run orchestration (memory / fixture)', () => {
  test('configure → launch → monitor → pause → resume → complete', async ({ page }) => {
    await page.goto('/research');
    await expect(page.getByTestId('research-hub')).toBeVisible();

    await page.getByTestId('start-research-run').click();
    await expect(page.getByTestId('research-run-new')).toBeVisible();
    await expect(page.getByTestId('run-mode')).toHaveValue('fixture');

    await page.getByTestId('run-name').fill('E2E orchestration run');
    await page.getByTestId('run-segment').fill('pilot-accounting-segment');
    await page.getByTestId('run-max-orgs').fill('2');
    await page.getByTestId('run-max-pages').fill('2');
    await page.getByTestId('run-max-requests').fill('20');

    await page.getByTestId('preview-research-run').click();
    await expect(page.getByTestId('approval-status')).toHaveText('gates_passed');
    await expect(page.getByTestId('launch-blockers')).toContainText(/No launch blockers/i);
    await expect(page.getByTestId('estimated-requests')).not.toHaveText('—');
    await expect(page.getByTestId('live-research-enabled')).toHaveText('false');
    await expect(page.getByTestId('launch-research-run')).toBeEnabled();

    await page.getByTestId('launch-research-run').click();
    await expect(page.getByTestId('research-run-detail')).toBeVisible();
    await expect(page.getByTestId('research-run-status')).toHaveText('queued');
    await expect(page.getByTestId('research-run-mode')).toHaveText('fixture');
    await expect(page.getByTestId('advance-research-run')).toBeVisible();

    await page.getByTestId('advance-research-run').click();
    await expect(page.getByTestId('research-run-status')).toHaveText('running');
    await expect(page.getByTestId('research-run-targets-completed')).toHaveText(/[1-9]/);
    await expect(page.getByTestId('pause-research-run')).toBeVisible();

    await page.getByTestId('pause-research-run').click();
    await expect(page.getByTestId('research-run-status')).toHaveText('paused');
    await expect(page.getByTestId('resume-research-run')).toBeVisible();

    await page.getByTestId('resume-research-run').click();
    await expect(page.getByTestId('research-run-status')).toHaveText('queued');

    // Drain remaining deferred execute jobs until completed.
    for (let i = 0; i < 8; i += 1) {
      const status = await page.getByTestId('research-run-status').textContent();
      if (status === 'completed') break;
      const advance = page.getByTestId('advance-research-run');
      if (await advance.count()) {
        await advance.click();
      } else {
        break;
      }
    }

    await expect(page.getByTestId('research-run-status')).toHaveText('completed');
    await expect(page.getByTestId('link-extraction-review')).toBeVisible();

    await page.goto('/research/runs');
    await expect(page.getByTestId('research-runs-table')).toBeVisible();
    await expect(page.getByTestId('research-runs-table')).toContainText('completed');

    await page.goto('/research');
    await expect(page.getByTestId('metric-research-runs')).toHaveText(/[1-9]/);
  });
});
