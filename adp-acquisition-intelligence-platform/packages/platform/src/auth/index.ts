export type AuthPrincipal = {
  userId: string;
  email?: string;
  displayName?: string;
  roles: string[];
};

export type AuthenticationPort = {
  /**
   * Validates an inbound credential/session and returns the authenticated principal.
   * Prompt 1 provides the port only; Entra ID OIDC wiring is configured via ADR-004.
   */
  authenticate(input: {
    authorizationHeader?: string;
    sessionToken?: string;
  }): Promise<AuthPrincipal>;
};

export type AuthorizationContext = {
  principal: AuthPrincipal;
  territoryIds?: string[];
  organizationId?: string;
  action: string;
  resource: string;
};

export type AuthorizationPort = {
  /**
   * Server-side capability and territory checks.
   * Territories are authorization scopes (ADR-003), not tenants.
   */
  authorize(context: AuthorizationContext): Promise<void>;
};

export class DenyAllAuthorization implements AuthorizationPort {
  async authorize(_context: AuthorizationContext): Promise<void> {
    throw new Error('Authorization adapter not configured');
  }
}

export class UnconfiguredAuthentication implements AuthenticationPort {
  async authenticate(): Promise<AuthPrincipal> {
    throw new Error('Authentication adapter not configured');
  }
}
