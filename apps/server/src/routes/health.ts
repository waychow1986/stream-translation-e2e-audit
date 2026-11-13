import type { FastifyInstance } from "fastify";

import type { Environment } from "../config.js";

interface HealthRouteOptions {
  isReady: () => boolean;
  environment: Environment;
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  options: HealthRouteOptions,
): Promise<void> {
  app.get("/health/live", async () => ({ status: "live" }));

  app.get("/health/ready", async (_request, reply) => {
    if (!options.isReady()) {
      return reply.code(503).send({ status: "not-ready" });
    }

    return { status: "ready" };
  });

  app.get("/candidate-identity", async (_request, reply) => {
    const deliveryId = options.environment.AIDELIVERY_DELIVERY_ID;
    const candidateSha = options.environment.AIDELIVERY_CANDIDATE_SHA;

    if (!deliveryId || !candidateSha) {
      return reply.code(503).send({ status: "not-ready" });
    }

    return { deliveryId, candidateSha };
  });
}
