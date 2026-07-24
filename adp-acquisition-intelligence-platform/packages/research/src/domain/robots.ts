export type RobotsEvaluation = {
  allowed: boolean;
  reason: string;
  policy: 'respect' | 'block_all' | 'allow_public_paths';
};

export function evaluateRobotsPolicy(input: {
  robotsTxt: string | null;
  path: string;
  userAgent?: string;
  behavior?: 'respect' | 'block_all' | 'allow_public_paths';
}): RobotsEvaluation {
  const behavior = input.behavior ?? 'respect';
  if (behavior === 'block_all') {
    return { allowed: false, reason: 'source_policy_block_all', policy: behavior };
  }
  if (behavior === 'allow_public_paths') {
    const allowed = isPublicPath(input.path);
    return {
      allowed,
      reason: allowed ? 'public_path_allowlist' : 'path_not_in_public_allowlist',
      policy: behavior,
    };
  }
  if (!input.robotsTxt) {
    return { allowed: true, reason: 'robots_unavailable_default_allow', policy: behavior };
  }
  const disallows = parseDisallows(input.robotsTxt, input.userAgent ?? '*');
  for (const rule of disallows) {
    if (input.path.startsWith(rule)) {
      return { allowed: false, reason: `robots_disallow:${rule}`, policy: behavior };
    }
  }
  return { allowed: true, reason: 'robots_allow', policy: behavior };
}

function isPublicPath(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p === '/' ||
    p.startsWith('/about') ||
    p.startsWith('/services') ||
    p.startsWith('/locations') ||
    p.startsWith('/team') ||
    p.startsWith('/leadership') ||
    p.startsWith('/careers') ||
    p.startsWith('/news') ||
    p.startsWith('/blog') ||
    p.startsWith('/contact')
  );
}

function parseDisallows(robotsTxt: string, userAgent: string): string[] {
  const lines = robotsTxt.split(/\r?\n/);
  let inAgent = false;
  const rules: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith('user-agent:')) {
      const agent = line.slice('user-agent:'.length).trim();
      inAgent = agent === '*' || agent.toLowerCase() === userAgent.toLowerCase();
      continue;
    }
    if (inAgent && lower.startsWith('disallow:')) {
      const path = line.slice('disallow:'.length).trim();
      if (path) rules.push(path);
    }
  }
  return rules;
}
