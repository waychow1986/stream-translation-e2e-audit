import type { FastifyBaseLogger } from "fastify";

export const loggerOptions = {
  level: "info",
  serializers: {
    req(request: {
      id?: string;
      method?: string;
      url?: string;
    }) {
      return {
        requestId: request.id,
        method: request.method,
        path: request.url?.split("?")[0],
      };
    },
    res(response: { statusCode?: number }) {
      return { statusCode: response.statusCode };
    },
    err(error: { name?: string; code?: string }) {
      return { type: error.name, code: error.code };
    },
  },
} as const;

export function logConfigurationFailure(
  logger: FastifyBaseLogger,
  issues: string[],
): void {
  logger.warn(
    { stage: "configuration", issueCodes: issues.map((_, index) => index + 1) },
    "Application configuration is not ready",
  );
}
