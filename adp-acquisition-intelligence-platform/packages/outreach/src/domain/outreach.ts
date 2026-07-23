import type { Channel, PermissionEvaluation } from '@adp/consent';

export type OutreachActorRole = 'admin' | 'sales' | 'reviewer';

export type OutreachActor = {
  userId: string;
  roles: readonly OutreachActorRole[];
};

export type ReadinessReason = {
  code: string;
  message: string;
  blocking: boolean;
};

export type ReadinessAssessment = {
  ready: boolean;
  reasons: ReadinessReason[];
  permission: PermissionEvaluation | null;
};

const outreachReadyStages = new Set(['discovery_completed', 'outreach_ready', 'outreach_active']);

export function actorHasRole(actor: OutreachActor, allowed: readonly OutreachActorRole[]): boolean {
  return actor.roles.some((role) => allowed.includes(role));
}

export function evaluateReadiness(input: {
  prospectStage: string;
  ownerUserId: string | null;
  contactPresent: boolean;
  permission: PermissionEvaluation | null;
  channel: Channel;
}): ReadinessAssessment {
  const reasons: ReadinessReason[] = [];

  if (!outreachReadyStages.has(input.prospectStage)) {
    reasons.push({
      code: 'prospect_stage_not_ready',
      message: `Prospect stage ${input.prospectStage} is not outreach-ready`,
      blocking: true,
    });
  }
  if (input.ownerUserId === null) {
    reasons.push({
      code: 'owner_missing',
      message: 'Organization has no assigned owner',
      blocking: true,
    });
  }
  if (!input.contactPresent) {
    reasons.push({
      code: 'contact_missing',
      message: 'A target contact is required for outreach readiness',
      blocking: true,
    });
  }
  if (input.permission === null) {
    reasons.push({
      code: 'permission_not_evaluated',
      message: `Channel permission for ${input.channel} was not evaluated`,
      blocking: true,
    });
  } else if (!input.permission.allowed) {
    reasons.push({
      code: 'permission_blocked',
      message: `Outreach on ${input.channel} is blocked (${input.permission.state})`,
      blocking: true,
    });
  }

  const blocking = reasons.some((reason) => reason.blocking);
  return {
    ready: !blocking,
    reasons,
    permission: input.permission,
  };
}

const templateTokenRe = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function renderTemplate(template: string, context: Record<string, string>): string {
  const requiredKeys = new Set<string>();
  for (const match of template.matchAll(templateTokenRe)) {
    const key = match[1];
    if (key !== undefined) requiredKeys.add(key);
  }
  for (const key of requiredKeys) {
    if (!(key in context)) {
      throw new Error(`Missing template context key: ${key}`);
    }
  }
  return template.replace(templateTokenRe, (_full, key: string) => context[key] ?? '');
}

export function extractTemplateKeys(template: string): string[] {
  const keys = new Set<string>();
  for (const match of template.matchAll(templateTokenRe)) {
    const key = match[1];
    if (key !== undefined) keys.add(key);
  }
  return [...keys];
}

export type SequenceEligibility = { eligible: true } | { eligible: false; reasons: string[] };

export function evaluateSequenceEligibility(input: {
  enrollmentStatus: 'pending' | 'active' | 'paused' | 'completed' | 'exited' | 'blocked';
  priorStepComplete: boolean;
  due: boolean;
  permissionAllowed: boolean;
}): SequenceEligibility {
  const reasons: string[] = [];
  if (input.enrollmentStatus !== 'active') {
    reasons.push(`enrollment_status_${input.enrollmentStatus}`);
  }
  if (!input.priorStepComplete) {
    reasons.push('prior_step_incomplete');
  }
  if (!input.due) {
    reasons.push('step_not_due');
  }
  if (!input.permissionAllowed) {
    reasons.push('permission_blocked');
  }
  return reasons.length === 0 ? { eligible: true } : { eligible: false, reasons };
}

export function shouldPauseForClassification(classification: string): boolean {
  return (
    classification === 'unsubscribe' ||
    classification === 'meeting_booked' ||
    classification === 'negative' ||
    classification === 'wrong_contact'
  );
}

export function shouldExitForClassification(classification: string): boolean {
  return classification === 'unsubscribe' || classification === 'wrong_contact';
}
