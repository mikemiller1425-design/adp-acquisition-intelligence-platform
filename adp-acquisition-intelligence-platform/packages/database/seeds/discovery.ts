import { readFile } from 'node:fs/promises';

import { and, eq, sql } from 'drizzle-orm';
import YAML from 'yaml';

import {
  discoveryQuestions,
  discoveryTemplateQuestions,
  discoveryTemplates,
  variableDefinitions,
  variableDefinitionVersions,
  type RepositoryExecutor,
} from '../src/index.js';

export interface DiscoverySeedSummary {
  templates: number;
  questions: number;
}

type DiscoveryLibrary = {
  templates: Array<{
    key: string;
    version: string;
    name: string;
    description: string;
    motion?: string;
    organization_type?: string;
    contact_type?: string;
    qualification_outcomes?: string[];
    status: 'draft' | 'published' | 'retired';
    questions: Array<{
      key: string;
      version: string;
      prompt: string;
      help_text?: string;
      answer_type:
        | 'text'
        | 'number'
        | 'boolean'
        | 'date'
        | 'datetime'
        | 'single_select'
        | 'multi_select'
        | 'money'
        | 'percentage'
        | 'json';
      variable_key?: string;
      required_default?: boolean;
      high_impact?: boolean;
      tags?: string[];
      score_impact?: unknown[];
      rationale?: string;
    }>;
  }>;
};

const libraryPath = new URL('../../../config/discovery/phase1-library.v1.yaml', import.meta.url);

export async function seedDiscoveryLibrary(
  db: RepositoryExecutor,
  publishedByUserId: string | null = null,
): Promise<DiscoverySeedSummary> {
  const raw = YAML.parse(await readFile(libraryPath, 'utf8')) as DiscoveryLibrary;
  let questionCount = 0;

  for (const template of raw.templates) {
    const templateRow = first(
      await db
        .insert(discoveryTemplates)
        .values({
          key: template.key,
          version: template.version,
          name: template.name,
          description: template.description,
          motion: template.motion ?? null,
          organizationType: template.organization_type ?? null,
          contactType: template.contact_type ?? null,
          qualificationOutcomes: template.qualification_outcomes ?? [],
          status: template.status,
          publishedAt: template.status === 'published' ? new Date() : null,
          publishedByUserId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [discoveryTemplates.key, discoveryTemplates.version],
          set: {
            name: template.name,
            description: template.description,
            motion: template.motion ?? null,
            organizationType: template.organization_type ?? null,
            contactType: template.contact_type ?? null,
            qualificationOutcomes: template.qualification_outcomes ?? [],
            status: template.status,
            publishedAt:
              template.status === 'published'
                ? sql`coalesce(${discoveryTemplates.publishedAt}, now())`
                : null,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: discoveryTemplates.id }),
      `template ${template.key}`,
    );

    for (const [index, question] of template.questions.entries()) {
      const variable = question.variable_key
        ? await lookupVariable(db, question.variable_key)
        : { definitionId: null, versionId: null };
      const questionRow = first(
        await db
          .insert(discoveryQuestions)
          .values({
            key: question.key,
            version: question.version,
            prompt: question.prompt,
            helpText: question.help_text ?? null,
            answerType: question.answer_type,
            variableDefinitionId: variable.definitionId,
            variableDefinitionVersionId: variable.versionId,
            scoreImpact: question.score_impact ?? [],
            requiredDefault: question.required_default ?? false,
            highImpact: question.high_impact ?? false,
            tags: question.tags ?? [],
            status: 'published',
            publishedAt: new Date(),
            publishedByUserId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [discoveryQuestions.key, discoveryQuestions.version],
            set: {
              prompt: question.prompt,
              helpText: question.help_text ?? null,
              answerType: question.answer_type,
              variableDefinitionId: variable.definitionId,
              variableDefinitionVersionId: variable.versionId,
              scoreImpact: question.score_impact ?? [],
              requiredDefault: question.required_default ?? false,
              highImpact: question.high_impact ?? false,
              tags: question.tags ?? [],
              status: 'published',
              publishedAt: sql`coalesce(${discoveryQuestions.publishedAt}, now())`,
              updatedAt: sql`now()`,
            },
          })
          .returning({ id: discoveryQuestions.id }),
        `question ${question.key}`,
      );

      await db
        .insert(discoveryTemplateQuestions)
        .values({
          templateId: templateRow.id,
          questionId: questionRow.id,
          displayOrder: index + 1,
          required: question.required_default ?? false,
          rationale: question.rationale ?? null,
        })
        .onConflictDoUpdate({
          target: [discoveryTemplateQuestions.templateId, discoveryTemplateQuestions.questionId],
          set: {
            displayOrder: index + 1,
            required: question.required_default ?? false,
            rationale: question.rationale ?? null,
          },
        });
      questionCount += 1;
    }
  }

  return { templates: raw.templates.length, questions: questionCount };
}

async function lookupVariable(
  db: RepositoryExecutor,
  key: string,
): Promise<{ definitionId: string | null; versionId: string | null }> {
  const definition = (
    await db
      .select({ id: variableDefinitions.id })
      .from(variableDefinitions)
      .where(eq(variableDefinitions.key, key))
      .limit(1)
  )[0];
  if (definition === undefined) {
    return { definitionId: null, versionId: null };
  }
  const version = (
    await db
      .select({ id: variableDefinitionVersions.id })
      .from(variableDefinitionVersions)
      .where(
        and(
          eq(variableDefinitionVersions.definitionId, definition.id),
          eq(variableDefinitionVersions.lifecycleStatus, 'active'),
        ),
      )
      .limit(1)
  )[0];
  return { definitionId: definition.id, versionId: version?.id ?? null };
}

function first<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`Seed did not return expected row for ${label}.`);
  return row;
}
