export const discoveryActorRoles = ['admin', 'researcher', 'sales', 'reviewer'] as const;
export type DiscoveryActorRole = (typeof discoveryActorRoles)[number];

export type DiscoveryActor = {
  userId: string;
  roles: readonly DiscoveryActorRole[];
};

export const discoverySessionStatuses = [
  'draft',
  'prepared',
  'scheduled',
  'in_progress',
  'completed',
  'reviewed',
  'cancelled',
  'no_show',
  'incomplete',
] as const;
export type DiscoverySessionStatus = (typeof discoverySessionStatuses)[number];

export const discoveryAnswerStatuses = [
  'answered',
  'unknown',
  'declined',
  'not_applicable',
  'not_asked',
] as const;
export type DiscoveryAnswerStatus = (typeof discoveryAnswerStatuses)[number];

export const discoveryMappingStatuses = ['proposed', 'confirmed', 'rejected'] as const;
export type DiscoveryMappingStatus = (typeof discoveryMappingStatuses)[number];

export type DiscoveryRecommendation = {
  nextAction:
    | 'continue_discovery'
    | 'confirm_mappings'
    | 'reassess_qualification'
    | 'advance_to_outreach_ready'
    | 'follow_up';
  reasons: readonly string[];
  scoreMovements: readonly {
    scoreKey: string;
    before: number | null;
    after: number | null;
  }[];
};

export function actorHasRole(
  actor: DiscoveryActor,
  allowed: readonly DiscoveryActorRole[],
): boolean {
  return actor.roles.some((role) => allowed.includes(role));
}

export function canCompleteSession(input: {
  requiredAgendaItemIds: readonly string[];
  answeredAgendaItemIds: readonly string[];
  openProposedMappingCount: number;
}): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const answered = new Set(input.answeredAgendaItemIds);
  for (const itemId of input.requiredAgendaItemIds) {
    if (!answered.has(itemId)) {
      reasons.push(`required_agenda_item_unanswered:${itemId}`);
    }
  }
  if (input.openProposedMappingCount > 0) {
    reasons.push('proposed_mappings_unreviewed');
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export function recommendAfterMapping(input: {
  confirmedCount: number;
  rejectedCount: number;
  openProposedCount: number;
  scoreMovements: readonly { scoreKey: string; before: number | null; after: number | null }[];
  openBlockingConditions: number;
}): DiscoveryRecommendation {
  if (input.openBlockingConditions > 0) {
    return {
      nextAction: 'reassess_qualification',
      reasons: ['open_blocking_qualification_conditions'],
      scoreMovements: input.scoreMovements,
    };
  }
  if (input.openProposedCount > 0) {
    return {
      nextAction: 'confirm_mappings',
      reasons: ['mappings_awaiting_review'],
      scoreMovements: input.scoreMovements,
    };
  }
  if (input.confirmedCount === 0 && input.rejectedCount > 0) {
    return {
      nextAction: 'continue_discovery',
      reasons: ['all_mappings_rejected'],
      scoreMovements: input.scoreMovements,
    };
  }
  if (input.confirmedCount > 0) {
    return {
      nextAction: 'advance_to_outreach_ready',
      reasons: ['mappings_confirmed_and_rescored'],
      scoreMovements: input.scoreMovements,
    };
  }
  return {
    nextAction: 'follow_up',
    reasons: ['no_confirmed_mappings'],
    scoreMovements: input.scoreMovements,
  };
}
