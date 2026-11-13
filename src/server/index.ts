import { buildApp } from "./app.ts";
import { createAzureCredential, createCognitiveTokenProvider } from "./azure-credential.ts";
import { loadConfig } from "./config.ts";
import { FoundryTranslator } from "./foundry-adapter.ts";
import { log } from "./logger.ts";
import { SpeechTokenProvider } from "./speech-token.ts";

const config = loadConfig();
const credential = createAzureCredential(config.azureClientId);
const bearer = createCognitiveTokenProvider(credential);
const tokenProvider = new SpeechTokenProvider(config.speechResourceId, async () => {
  const token = await credential.getToken("https://cognitiveservices.azure.com/.default");
  if (!token) throw new Error("Speech access token unavailable");
  return token;
});
const translator = new FoundryTranslator(config.aiProjectEndpoint, config.modelDeployment, bearer);
const app = await buildApp({ config, tokenProvider, translator });
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("shutdown", { signal });
  app.shutdownTranslations();
  await app.close();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
await app.listen({ host: "0.0.0.0", port: config.port });
log("started", { statusCode: 200 });
