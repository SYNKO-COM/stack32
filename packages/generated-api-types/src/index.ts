/**
 * Placeholder for TypeScript types generated from the agent-service OpenAPI schema.
 *
 * TODO(phase-3): generate these types from services/agent-service OpenAPI
 * (e.g. with openapi-typescript) and consume them in apps/web instead of
 * the hand-written mirrors in apps/web/lib/domain.
 */

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
}
