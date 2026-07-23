import { readFile } from 'node:fs/promises';

import { eq } from 'drizzle-orm';
import YAML from 'yaml';

import {
  messageTemplateVersions,
  messageTemplates,
  outreachCampaignVersions,
  outreachCampaigns,
  outreachSequenceSteps,
  outreachSequenceVersions,
  outreachSequences,
  type RepositoryExecutor,
} from '../src/index.js';

export interface OutreachSeedSummary {
  campaigns: number;
  sequences: number;
  templates: number;
  steps: number;
}

type OutreachLibrary = {
  campaigns: Array<{
    key: string;
    version: string;
    name: string;
    description: string;
    default_channel:
      | 'email'
      | 'phone'
      | 'voicemail'
      | 'linkedin'
      | 'internal_introduction'
      | 'meeting'
      | 'manual_follow_up';
    status: 'draft' | 'published' | 'retired';
    sequence_key: string;
  }>;
  sequences: Array<{
    key: string;
    version: string;
    name: string;
    description: string;
    status: 'draft' | 'published' | 'retired';
    steps: Array<{
      step_order: number;
      template_key: string;
      channel:
        | 'email'
        | 'phone'
        | 'voicemail'
        | 'linkedin'
        | 'internal_introduction'
        | 'meeting'
        | 'manual_follow_up';
      delay_days: number;
      wait_for_response: boolean;
    }>;
  }>;
  templates: Array<{
    key: string;
    version: string;
    name: string;
    channel:
      | 'email'
      | 'phone'
      | 'voicemail'
      | 'linkedin'
      | 'internal_introduction'
      | 'meeting'
      | 'manual_follow_up';
    status: 'draft' | 'published' | 'retired';
    subject_template?: string;
    body_template: string;
    context_keys: string[];
  }>;
};

const libraryPath = new URL('../../../config/outreach/phase1-library.v1.yaml', import.meta.url);

export async function seedOutreachLibrary(
  db: RepositoryExecutor,
  publishedByUserId: string | null = null,
): Promise<OutreachSeedSummary> {
  const raw = YAML.parse(await readFile(libraryPath, 'utf8')) as OutreachLibrary;
  const templateVersionIds = new Map<string, string>();
  const sequenceVersionIds = new Map<string, string>();
  let stepCount = 0;

  for (const template of raw.templates) {
    const templateRow = first(
      await db
        .insert(messageTemplates)
        .values({
          key: template.key,
          name: template.name,
          channel: template.channel,
          status: template.status,
        })
        .onConflictDoUpdate({
          target: messageTemplates.key,
          set: {
            name: template.name,
            channel: template.channel,
            status: template.status,
            updatedAt: new Date(),
          },
        })
        .returning({ id: messageTemplates.id }),
    );

    const versionRow = first(
      await db
        .insert(messageTemplateVersions)
        .values({
          templateId: templateRow.id,
          version: template.version,
          subjectTemplate: template.subject_template ?? null,
          bodyTemplate: template.body_template.trim(),
          contextKeys: template.context_keys,
          status: template.status,
          publishedAt: template.status === 'published' ? new Date() : null,
          publishedByUserId,
        })
        .onConflictDoUpdate({
          target: [messageTemplateVersions.templateId, messageTemplateVersions.version],
          set: {
            subjectTemplate: template.subject_template ?? null,
            bodyTemplate: template.body_template.trim(),
            contextKeys: template.context_keys,
            status: template.status,
            publishedAt: template.status === 'published' ? new Date() : null,
            publishedByUserId,
            updatedAt: new Date(),
          },
        })
        .returning({ id: messageTemplateVersions.id }),
    );

    if (template.status === 'published') {
      await db
        .update(messageTemplates)
        .set({ currentVersionId: versionRow.id, status: 'published', updatedAt: new Date() })
        .where(eq(messageTemplates.id, templateRow.id));
    }

    templateVersionIds.set(`${template.key}:${template.version}`, versionRow.id);
  }

  for (const sequence of raw.sequences) {
    const sequenceRow = first(
      await db
        .insert(outreachSequences)
        .values({
          key: sequence.key,
          name: sequence.name,
          description: sequence.description,
          status: sequence.status,
        })
        .onConflictDoUpdate({
          target: outreachSequences.key,
          set: {
            name: sequence.name,
            description: sequence.description,
            status: sequence.status,
            updatedAt: new Date(),
          },
        })
        .returning({ id: outreachSequences.id }),
    );

    const versionRow = first(
      await db
        .insert(outreachSequenceVersions)
        .values({
          sequenceId: sequenceRow.id,
          version: sequence.version,
          name: sequence.name,
          description: sequence.description,
          status: sequence.status,
          publishedAt: sequence.status === 'published' ? new Date() : null,
          publishedByUserId,
        })
        .onConflictDoUpdate({
          target: [outreachSequenceVersions.sequenceId, outreachSequenceVersions.version],
          set: {
            name: sequence.name,
            description: sequence.description,
            status: sequence.status,
            publishedAt: sequence.status === 'published' ? new Date() : null,
            publishedByUserId,
            updatedAt: new Date(),
          },
        })
        .returning({ id: outreachSequenceVersions.id }),
    );

    if (sequence.status === 'published') {
      await db
        .update(outreachSequences)
        .set({ currentVersionId: versionRow.id, status: 'published', updatedAt: new Date() })
        .where(eq(outreachSequences.id, sequenceRow.id));
    }

    sequenceVersionIds.set(`${sequence.key}:${sequence.version}`, versionRow.id);

    for (const step of sequence.steps) {
      const templateVersionId = templateVersionIds.get(`${step.template_key}:1.0.0`);
      if (templateVersionId === undefined) {
        throw new Error(`Missing template version for step template ${step.template_key}`);
      }
      await db
        .insert(outreachSequenceSteps)
        .values({
          sequenceVersionId: versionRow.id,
          stepOrder: step.step_order,
          templateVersionId,
          channel: step.channel,
          delayDays: step.delay_days,
          waitForResponse: step.wait_for_response,
        })
        .onConflictDoUpdate({
          target: [outreachSequenceSteps.sequenceVersionId, outreachSequenceSteps.stepOrder],
          set: {
            templateVersionId,
            channel: step.channel,
            delayDays: step.delay_days,
            waitForResponse: step.wait_for_response,
          },
        });
      stepCount += 1;
    }
  }

  for (const campaign of raw.campaigns) {
    const sequenceVersionId = sequenceVersionIds.get(`${campaign.sequence_key}:1.0.0`);
    if (sequenceVersionId === undefined) {
      throw new Error(`Missing sequence version for campaign ${campaign.key}`);
    }

    const campaignRow = first(
      await db
        .insert(outreachCampaigns)
        .values({
          key: campaign.key,
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
        })
        .onConflictDoUpdate({
          target: outreachCampaigns.key,
          set: {
            name: campaign.name,
            description: campaign.description,
            status: campaign.status,
            updatedAt: new Date(),
          },
        })
        .returning({ id: outreachCampaigns.id }),
    );

    const versionRow = first(
      await db
        .insert(outreachCampaignVersions)
        .values({
          campaignId: campaignRow.id,
          version: campaign.version,
          name: campaign.name,
          description: campaign.description,
          sequenceVersionId,
          defaultChannel: campaign.default_channel,
          status: campaign.status,
          publishedAt: campaign.status === 'published' ? new Date() : null,
          publishedByUserId,
        })
        .onConflictDoUpdate({
          target: [outreachCampaignVersions.campaignId, outreachCampaignVersions.version],
          set: {
            name: campaign.name,
            description: campaign.description,
            sequenceVersionId,
            defaultChannel: campaign.default_channel,
            status: campaign.status,
            publishedAt: campaign.status === 'published' ? new Date() : null,
            publishedByUserId,
            updatedAt: new Date(),
          },
        })
        .returning({ id: outreachCampaignVersions.id }),
    );

    if (campaign.status === 'published') {
      await db
        .update(outreachCampaigns)
        .set({ currentVersionId: versionRow.id, status: 'published', updatedAt: new Date() })
        .where(eq(outreachCampaigns.id, campaignRow.id));
    }
  }

  return {
    campaigns: raw.campaigns.length,
    sequences: raw.sequences.length,
    templates: raw.templates.length,
    steps: stepCount,
  };
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected database row');
  return row;
}
