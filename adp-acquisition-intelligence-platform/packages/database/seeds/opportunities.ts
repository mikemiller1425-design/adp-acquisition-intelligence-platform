import { readFile } from 'node:fs/promises';

import { sql } from 'drizzle-orm';
import YAML from 'yaml';

import {
  opportunityLossReasons,
  opportunityStageDefinitions,
  type RepositoryExecutor,
} from '../src/index.js';

export interface OpportunitySeedSummary {
  stageDefinitions: number;
  lossReasons: number;
}

type StageDefinitionsLibrary = {
  stages: Array<{
    stage_key:
      | 'open'
      | 'discovery_validation'
      | 'solution_alignment'
      | 'commercial_review'
      | 'won'
      | 'lost'
      | 'nurture';
    version: string;
    display_name: string;
    description: string;
    default_probability: number | null;
    max_age_days: number | null;
    entry_criteria: Record<string, unknown>;
    exit_criteria: Record<string, unknown>;
  }>;
};

type LossReasonsLibrary = {
  loss_reasons: Array<{
    key: string;
    display_name: string;
    description: string;
    sort_order: number;
  }>;
};

const stageDefinitionsPath = new URL(
  '../../../config/opportunities/stage-definitions.v1.yaml',
  import.meta.url,
);
const lossReasonsPath = new URL(
  '../../../config/opportunities/loss-reasons.v1.yaml',
  import.meta.url,
);

export async function seedOpportunityLibrary(
  db: RepositoryExecutor,
  publishedByUserId: string | null = null,
): Promise<OpportunitySeedSummary> {
  const stageRaw = YAML.parse(
    await readFile(stageDefinitionsPath, 'utf8'),
  ) as StageDefinitionsLibrary;
  const lossRaw = YAML.parse(await readFile(lossReasonsPath, 'utf8')) as LossReasonsLibrary;
  const publishedAt = new Date();

  for (const stage of stageRaw.stages) {
    await db
      .insert(opportunityStageDefinitions)
      .values({
        stageKey: stage.stage_key,
        version: stage.version,
        displayName: stage.display_name,
        description: stage.description,
        defaultProbability:
          stage.default_probability === null ? null : String(stage.default_probability),
        entryCriteria: stage.entry_criteria,
        exitCriteria: stage.exit_criteria,
        maxAgeDays: stage.max_age_days,
        status: 'active',
        publishedAt,
        publishedByUserId,
      })
      .onConflictDoUpdate({
        target: [opportunityStageDefinitions.stageKey, opportunityStageDefinitions.version],
        set: {
          displayName: stage.display_name,
          description: stage.description,
          defaultProbability:
            stage.default_probability === null ? null : String(stage.default_probability),
          entryCriteria: stage.entry_criteria,
          exitCriteria: stage.exit_criteria,
          maxAgeDays: stage.max_age_days,
          status: 'active',
          publishedAt,
          publishedByUserId,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const reason of lossRaw.loss_reasons) {
    await db
      .insert(opportunityLossReasons)
      .values({
        key: reason.key,
        displayName: reason.display_name,
        description: reason.description,
        sortOrder: reason.sort_order,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: opportunityLossReasons.key,
        set: {
          displayName: reason.display_name,
          description: reason.description,
          sortOrder: reason.sort_order,
          status: 'active',
          updatedAt: sql`now()`,
        },
      });
  }

  return {
    stageDefinitions: stageRaw.stages.length,
    lossReasons: lossRaw.loss_reasons.length,
  };
}
