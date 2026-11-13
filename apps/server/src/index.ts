import { fileURLToPath } from "node:url";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const staticRoot = fileURLToPath(
  new URL("../../web/dist", import.meta.url),
);
const configuration = loadConfig(process.env);
const app = await buildApp({ staticRoot });
const port = configuration.ready ? configuration.config.port : 8080;

try {
  await app.listen({ host: "0.0.0.0", port });
} catch {
  app.log.error(
    { stage: "configuration", code: "SERVER_START_FAILED" },
    "Server failed to start",
  );
  process.exitCode = 1;
}
