import { InMemoryJobDispatcher, type JobHandlerRegistryPort } from '@adp/platform';
import {
  createResearchRuntime,
  registerResearchJobHandlers,
  type ResearchRuntime,
} from '@adp/research';

/**
 * Registers Phase 1.1 research job handlers (bounded, fixture-only retrieval).
 * Prefer `registerResearchJobHandlers` from `@adp/research` for shared web/worker wiring.
 */
export function registerWorkerConsumers(
  jobs: JobHandlerRegistryPort = new InMemoryJobDispatcher(),
  runtime: ResearchRuntime = createResearchRuntime(),
) {
  return registerResearchJobHandlers(jobs, runtime);
}

export type { ResearchRuntime };
