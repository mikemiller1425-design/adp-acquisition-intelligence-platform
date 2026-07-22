export type AuditEventInput = {
  actorUserId?: string;
  action: string;
  subjectType: string;
  subjectId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
};

export type AuditPort = {
  /**
   * Append-only audit write. Implementations must not mutate prior events.
   */
  append(event: AuditEventInput): Promise<void>;
};

export class InMemoryAuditPort implements AuditPort {
  readonly events: AuditEventInput[] = [];

  async append(event: AuditEventInput): Promise<void> {
    const copy: AuditEventInput = {
      action: event.action,
      subjectType: event.subjectType,
    };
    if (event.actorUserId !== undefined) copy.actorUserId = event.actorUserId;
    if (event.subjectId !== undefined) copy.subjectId = event.subjectId;
    if (event.correlationId !== undefined) copy.correlationId = event.correlationId;
    if (event.metadata !== undefined) copy.metadata = { ...event.metadata };
    this.events.push(copy);
  }
}
