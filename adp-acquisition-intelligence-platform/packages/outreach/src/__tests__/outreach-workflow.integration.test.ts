import type { DatabaseClient, RepositoryExecutor } from '@adp/database';
import {
  accountAssignments,
  auditEvents,
  campaignEnrollments,
  contactChannelPermissions,
  contacts,
  createDatabaseClient,
  messageTemplateVersions,
  messageTemplates,
  organizations,
  outreachCampaignVersions,
  outreachCampaigns,
  outreachSequenceSteps,
  outreachSequenceVersions,
  outreachSequences,
  outboxEvents,
  suppressionEntries,
  territories,
  users,
} from '@adp/database';
import {
  acquireTestDatabaseLock,
  getTestDatabaseUrl,
  migrateTestDatabase,
  type TestDatabaseLock,
} from '@adp/database/testing';
import { ConsentPermissionService, PostgresPermissionRepository } from '@adp/consent';
import {
  OperationalStateService,
  PostgresOperationalStateTransitionRepository,
  PostgresOrganizationStateWriter,
} from '@adp/qualification';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ActivityService,
  ApprovalService,
  DraftService,
  EnrollmentService,
  OutreachReadinessService,
  ResponseService,
} from '../application/outreach-services.js';
import type { OutreachActor } from '../domain/outreach.js';
import {
  ConsentOptOutAdapter,
  ConsentPermissionAdapter,
  PostgresActivityRepository,
  PostgresApprovalRepository,
  PostgresCampaignRepository,
  PostgresDraftRepository,
  PostgresEnrollmentRepository,
  PostgresOrganizationContextAdapter,
  PostgresOutreachAuditAdapter,
  PostgresOutreachOutboxAdapter,
  PostgresReadinessRepository,
  PostgresResponseRepository,
  PostgresTemplateRepository,
} from '../infrastructure/postgres-outreach.js';

const testDatabaseUrl = getTestDatabaseUrl();
const actor = (userId: string): OutreachActor => ({
  userId,
  roles: ['sales', 'reviewer', 'admin'],
});

describe.sequential('Prompt 8 outreach workflow integration', () => {
  let lock: TestDatabaseLock;
  let client: DatabaseClient;

  beforeAll(async () => {
    lock = await acquireTestDatabaseLock(testDatabaseUrl);
    await migrateTestDatabase({ databaseUrl: testDatabaseUrl, reset: true });
    client = createDatabaseClient(testDatabaseUrl);
    await seedOutreachFixture(client.db, null);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await lock?.release();
  });

  it('enrolls, drafts, approves, marks sent, and classifies a response', async () => {
    const fixture = await createFixture(client, 'happy');
    const services = buildServices(client.db, fixture);

    const readiness = await services.readiness.assess({
      organizationId: fixture.organizationId,
      contactId: fixture.contactId,
      channel: 'email',
      actor: actor(fixture.userId),
      commandCorrelationId: '88888888-8888-8888-8888-888888888881',
    });
    expect(readiness.assessment.ready).toBe(true);

    const enrollment = await services.enrollment.enroll({
      organizationId: fixture.organizationId,
      contactId: fixture.contactId,
      campaignKey: 'phase1_payroll_intro',
      channel: 'email',
      actor: actor(fixture.userId),
      commandCorrelationId: '88888888-8888-8888-8888-888888888882',
    });
    expect(enrollment.status).toBe('active');

    const draft = await services.drafts.createFromTemplate({
      enrollmentId: enrollment.id,
      templateVersionId: fixture.templateVersionId,
      channel: 'email',
      context: {
        organization_name: 'Outreach Ready Advisors',
        contact_first_name: 'Taylor',
        sender_name: 'Sam Sales',
      },
      actor: actor(fixture.userId),
      commandCorrelationId: '88888888-8888-8888-8888-888888888883',
    });
    expect(draft.renderedBody).toContain('Taylor');
    expect(draft.renderedBody).not.toContain('{{');

    const approval = await services.approvals.requestApproval({
      draftId: draft.id,
      actor: actor(fixture.userId),
      commandCorrelationId: '88888888-8888-8888-8888-888888888884',
    });
    const approved = await services.approvals.approve({
      approvalId: approval.id,
      actor: actor(fixture.reviewerUserId),
      commandCorrelationId: '88888888-8888-8888-8888-888888888885',
    });
    expect(approved.status).toBe('approved');

    const activity = await services.activities.markSent({
      draftId: draft.id,
      actor: actor(fixture.userId),
      commandCorrelationId: '88888888-8888-8888-8888-888888888886',
    });
    expect(activity.activityType).toBe('marked_sent');

    const classified = await services.responses.recordAndClassify({
      enrollmentId: enrollment.id,
      channel: 'email',
      originalText: 'Thanks, can we talk next week?',
      classification: 'positive',
      actor: actor(fixture.reviewerUserId),
      activityId: activity.id,
      commandCorrelationId: '88888888-8888-8888-8888-888888888887',
    });
    expect(classified.classification.classification).toBe('positive');

    const audits = await client.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.organizationId, fixture.organizationId));
    expect(audits.some((row) => row.action === 'outreach.marked_sent')).toBe(true);

    const outbox = await client.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, fixture.organizationId));
    expect(outbox.some((row) => row.eventType === 'outreach.enrolled')).toBe(true);
    expect(outbox.some((row) => row.eventType === 'outreach.marked_sent')).toBe(true);
  });

  it('blocks enroll, approve, and mark sent when permission is unknown', async () => {
    const fixture = await createFixture(client, 'blocked');
    const services = buildServices(client.db, fixture);

    const readiness = await services.readiness.assess({
      organizationId: fixture.organizationId,
      contactId: fixture.contactId,
      channel: 'email',
      actor: actor(fixture.userId),
    });
    expect(readiness.assessment.ready).toBe(false);

    await expect(
      services.enrollment.enroll({
        organizationId: fixture.organizationId,
        contactId: fixture.contactId,
        campaignKey: 'phase1_payroll_intro',
        channel: 'email',
        actor: actor(fixture.userId),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const allowedFixture = await createFixture(client, 'approve-block');
    const allowedServices = buildServices(client.db, allowedFixture);
    const enrollment = await allowedServices.enrollment.enroll({
      organizationId: allowedFixture.organizationId,
      contactId: allowedFixture.contactId,
      campaignKey: 'phase1_payroll_intro',
      channel: 'email',
      actor: actor(allowedFixture.userId),
    });
    const draft = await allowedServices.drafts.createFromTemplate({
      enrollmentId: enrollment.id,
      templateVersionId: allowedFixture.templateVersionId,
      channel: 'email',
      context: {
        organization_name: 'Approve Block Advisors',
        contact_first_name: 'Casey',
        sender_name: 'Sam Sales',
      },
      actor: actor(allowedFixture.userId),
    });
    const approval = await allowedServices.approvals.requestApproval({
      draftId: draft.id,
      actor: actor(allowedFixture.userId),
    });
    const consent = new ConsentPermissionService(new PostgresPermissionRepository(client.db));
    await consent.assertContactChannelPermission({
      contactId: allowedFixture.contactId,
      channel: 'email',
      state: 'unknown',
      source: 'import',
      capturedByUserId: allowedFixture.userId,
      reasonCode: 'test_unknown_mid_flow',
      reasonNote: null,
      effectiveAt: new Date(),
      expiresAt: null,
      revokedAt: null,
      evidenceRef: null,
    });
    await expect(
      allowedServices.approvals.approve({
        approvalId: approval.id,
        actor: actor(allowedFixture.reviewerUserId),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await consent.assertContactChannelPermission({
      contactId: allowedFixture.contactId,
      channel: 'email',
      state: 'allowed',
      source: 'user_asserted',
      capturedByUserId: allowedFixture.userId,
      reasonCode: 'test_restore_allowed',
      reasonNote: null,
      effectiveAt: new Date(),
      expiresAt: null,
      revokedAt: null,
      evidenceRef: null,
    });
    await allowedServices.approvals.approve({
      approvalId: approval.id,
      actor: actor(allowedFixture.reviewerUserId),
    });
    await consent.assertContactChannelPermission({
      contactId: allowedFixture.contactId,
      channel: 'email',
      state: 'unknown',
      source: 'import',
      capturedByUserId: allowedFixture.userId,
      reasonCode: 'test_unknown_before_sent',
      reasonNote: null,
      effectiveAt: new Date(),
      expiresAt: null,
      revokedAt: null,
      evidenceRef: null,
    });
    await expect(
      allowedServices.activities.markSent({
        draftId: draft.id,
        actor: actor(allowedFixture.userId),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('pauses enrollment on unsubscribe classification and records opt-out', async () => {
    const fixture = await createFixture(client, 'optout');
    const services = buildServices(client.db, fixture);
    const enrollment = await services.enrollment.enroll({
      organizationId: fixture.organizationId,
      contactId: fixture.contactId,
      campaignKey: 'phase1_payroll_intro',
      channel: 'email',
      actor: actor(fixture.userId),
    });
    await services.responses.recordAndClassify({
      enrollmentId: enrollment.id,
      channel: 'email',
      originalText: 'Please remove me from future emails.',
      classification: 'unsubscribe',
      actor: actor(fixture.reviewerUserId),
    });
    const updated = first(
      await client.db
        .select()
        .from(campaignEnrollments)
        .where(eq(campaignEnrollments.id, enrollment.id)),
    );
    expect(['paused', 'exited']).toContain(updated.status);
    const suppression = first(
      await client.db
        .select()
        .from(suppressionEntries)
        .where(eq(suppressionEntries.contactId, fixture.contactId)),
    );
    expect(suppression.state).toBe('opted_out');
  });
});

function buildServices(db: RepositoryExecutor, _fixture: { userId: string }) {
  const consent = new ConsentPermissionService(new PostgresPermissionRepository(db));
  const operationalState = new OperationalStateService(
    new PostgresOrganizationStateWriter(db),
    new PostgresOperationalStateTransitionRepository(db),
  );
  const enrollments = new PostgresEnrollmentRepository(db);
  const enrollment = new EnrollmentService(
    enrollments,
    new PostgresCampaignRepository(db),
    new PostgresOrganizationContextAdapter(db),
    new ConsentPermissionAdapter(consent),
    operationalState,
    new PostgresOutreachAuditAdapter(db),
    new PostgresOutreachOutboxAdapter(db),
  );
  return {
    readiness: new OutreachReadinessService(
      new PostgresOrganizationContextAdapter(db),
      new ConsentPermissionAdapter(consent),
      new PostgresReadinessRepository(db),
      new PostgresOutreachAuditAdapter(db),
      new PostgresOutreachOutboxAdapter(db),
    ),
    enrollment,
    drafts: new DraftService(
      new PostgresDraftRepository(db),
      enrollments,
      new PostgresTemplateRepository(db),
      new ConsentPermissionAdapter(consent),
      new PostgresActivityRepository(db),
      new PostgresOutreachAuditAdapter(db),
      new PostgresOutreachOutboxAdapter(db),
    ),
    approvals: new ApprovalService(
      new PostgresApprovalRepository(db),
      new PostgresDraftRepository(db),
      enrollments,
      new ConsentPermissionAdapter(consent),
      new PostgresActivityRepository(db),
      new PostgresOutreachAuditAdapter(db),
      new PostgresOutreachOutboxAdapter(db),
    ),
    activities: new ActivityService(
      new PostgresActivityRepository(db),
      new PostgresDraftRepository(db),
      enrollments,
      new ConsentPermissionAdapter(consent),
      new PostgresOutreachAuditAdapter(db),
      new PostgresOutreachOutboxAdapter(db),
    ),
    responses: new ResponseService(
      new PostgresResponseRepository(db),
      enrollments,
      new PostgresActivityRepository(db),
      enrollment,
      new ConsentOptOutAdapter(consent),
      new PostgresOutreachAuditAdapter(db),
      new PostgresOutreachOutboxAdapter(db),
    ),
  };
}

async function createFixture(client: DatabaseClient, suffix: string) {
  const user = first(
    await client.db
      .insert(users)
      .values({
        externalSubjectId: `auth0|outreach-${suffix}`,
        email: `outreach-${suffix}@example.com`,
        displayName: `Outreach ${suffix}`,
        status: 'active',
      })
      .returning(),
  );
  const reviewer = first(
    await client.db
      .insert(users)
      .values({
        externalSubjectId: `auth0|outreach-reviewer-${suffix}`,
        email: `outreach-reviewer-${suffix}@example.com`,
        displayName: `Outreach Reviewer ${suffix}`,
        status: 'active',
      })
      .returning(),
  );
  const territory = first(
    await client.db
      .insert(territories)
      .values({
        code: `OUT-${suffix}`,
        name: `Outreach Territory ${suffix}`,
        description: 'Outreach fixture territory',
        status: 'active',
        createdByUserId: user.id,
        updatedByUserId: user.id,
      })
      .returning(),
  );
  const organization = first(
    await client.db
      .insert(organizations)
      .values({
        displayName: `Outreach Ready Advisors ${suffix}`,
        normalizedName: `outreach ready advisors ${suffix}`,
        normalizedDomain: `outreach-ready-${suffix}.example.com`,
        prospectStage: 'outreach_ready',
        outreachStatus: 'ready',
      })
      .returning(),
  );
  await client.db.insert(accountAssignments).values({
    organizationId: organization.id,
    userId: user.id,
    territoryId: territory.id,
    assignmentRole: 'owner',
  });
  const contact = first(
    await client.db
      .insert(contacts)
      .values({
        organizationId: organization.id,
        displayName: `Taylor Target ${suffix}`,
        email: `taylor-${suffix}@example.com`,
        normalizedEmail: `taylor-${suffix}@example.com`,
      })
      .returning(),
  );
  await client.db.insert(contactChannelPermissions).values({
    contactId: contact.id,
    channel: 'email',
    state: suffix === 'blocked' ? 'unknown' : 'allowed',
    source: suffix === 'blocked' ? 'import' : 'user_asserted',
    capturedByUserId: reviewer.id,
    reasonCode: 'test_fixture',
  });

  const templateVersion = first(
    await client.db
      .select({ id: messageTemplateVersions.id })
      .from(messageTemplateVersions)
      .innerJoin(messageTemplates, eq(messageTemplateVersions.templateId, messageTemplates.id))
      .where(eq(messageTemplates.key, 'phase1_intro_email'))
      .limit(1),
  );

  return {
    userId: user.id,
    reviewerUserId: reviewer.id,
    organizationId: organization.id,
    contactId: contact.id,
    templateVersionId: templateVersion.id,
  };
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected at least one row');
  return row;
}

async function seedOutreachFixture(db: RepositoryExecutor, publishedByUserId: string | null) {
  const introTemplate = first(
    await db
      .insert(messageTemplates)
      .values({ key: 'phase1_intro_email', name: 'Intro', channel: 'email', status: 'published' })
      .returning(),
  );
  const introVersion = first(
    await db
      .insert(messageTemplateVersions)
      .values({
        templateId: introTemplate.id,
        version: '1.0.0',
        subjectTemplate: 'Following up on {{organization_name}}',
        bodyTemplate:
          'Hi {{contact_first_name}}, thanks for speaking with us about {{organization_name}}.',
        contextKeys: ['organization_name', 'contact_first_name', 'sender_name'],
        status: 'published',
        publishedAt: new Date(),
        publishedByUserId,
      })
      .returning(),
  );
  const followTemplate = first(
    await db
      .insert(messageTemplates)
      .values({
        key: 'phase1_follow_up_email',
        name: 'Follow-up',
        channel: 'email',
        status: 'published',
      })
      .returning(),
  );
  first(
    await db
      .insert(messageTemplateVersions)
      .values({
        templateId: followTemplate.id,
        version: '1.0.0',
        subjectTemplate: 'Quick follow-up for {{organization_name}}',
        bodyTemplate: 'Hi {{contact_first_name}}, checking in about {{organization_name}}.',
        contextKeys: ['organization_name', 'contact_first_name', 'sender_name'],
        status: 'published',
        publishedAt: new Date(),
        publishedByUserId,
      })
      .returning(),
  );

  const sequence = first(
    await db
      .insert(outreachSequences)
      .values({
        key: 'phase1_payroll_two_step',
        name: 'Two Step',
        description: 'Fixture sequence',
        status: 'published',
      })
      .returning(),
  );
  const sequenceVersion = first(
    await db
      .insert(outreachSequenceVersions)
      .values({
        sequenceId: sequence.id,
        version: '1.0.0',
        name: 'Two Step',
        description: 'Fixture sequence version',
        status: 'published',
        publishedAt: new Date(),
        publishedByUserId,
      })
      .returning(),
  );
  await db.insert(outreachSequenceSteps).values([
    {
      sequenceVersionId: sequenceVersion.id,
      stepOrder: 1,
      templateVersionId: introVersion.id,
      channel: 'email',
      delayDays: 0,
      waitForResponse: false,
    },
    {
      sequenceVersionId: sequenceVersion.id,
      stepOrder: 2,
      templateVersionId: introVersion.id,
      channel: 'email',
      delayDays: 5,
      waitForResponse: true,
    },
  ]);

  const campaign = first(
    await db
      .insert(outreachCampaigns)
      .values({
        key: 'phase1_payroll_intro',
        name: 'Payroll Intro',
        description: 'Fixture campaign',
        status: 'published',
      })
      .returning(),
  );
  first(
    await db
      .insert(outreachCampaignVersions)
      .values({
        campaignId: campaign.id,
        version: '1.0.0',
        name: 'Payroll Intro',
        description: 'Fixture campaign version',
        sequenceVersionId: sequenceVersion.id,
        defaultChannel: 'email',
        status: 'published',
        publishedAt: new Date(),
        publishedByUserId,
      })
      .returning(),
  );

  void introVersion;
}
