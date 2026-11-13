import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";

const config = loadConfig();
const app = await buildApp(config);
let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log("shutdown.start");
  await app.close();
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

try {
  await app.listen({ host: "0.0.0.0", port: config.port });
  log("application.ready", { port: config.port, adapterMode: config.adapterMode });
} catch (error) {
  log("application.start_failed", { errorCode: "STARTUP_ERROR" });
  process.exitCode = 1;
}
