export interface AppConfig {
  nodeEnv: string;
  port: number;
  deliveryId: string;
  candidateSha: string;
  azureClientId: string;
  speechEndpoint: string;
  speechResourceId: string;
  foundryProjectEndpoint: string;
  modelDeployment: string;
  adapterMode: "azure" | "deterministic";
}

const resourceIdPattern = /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.CognitiveServices\/accounts\/[^/]+$/i;

function required(env: NodeJS.ProcessEnv | Record<string, string>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function isValidSpeechResourceId(value: string): boolean {
  return resourceIdPattern.test(value);
}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string> = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? "production";
  const adapterMode = env.APP_ADAPTER_MODE === "deterministic" ? "deterministic" : "azure";
  if (adapterMode === "deterministic" && nodeEnv !== "test") {
    throw new Error("Deterministic adapters are allowed only in test processes");
  }
  const speechEndpoint = required(env, "AZURE_SPEECH_ENDPOINT");
  const parsedSpeechEndpoint = new URL(speechEndpoint);
  if (parsedSpeechEndpoint.protocol !== "https:") throw new Error("AZURE_SPEECH_ENDPOINT must use HTTPS");
  const speechResourceId = required(env, "AZURE_SPEECH_RESOURCE_ID");
  if (!isValidSpeechResourceId(speechResourceId)) throw new Error("AZURE_SPEECH_RESOURCE_ID is malformed");
  const projectEndpoint = env.AZURE_AI_PROJECT_ENDPOINT?.trim();
  const compatibilityEndpoint = env.FOUNDRY_PROJECT_ENDPOINT?.trim();
  if (projectEndpoint && compatibilityEndpoint && projectEndpoint !== compatibilityEndpoint) {
    throw new Error("Foundry project endpoints conflict");
  }
  const port = Number(env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT is invalid");
  return {
    nodeEnv,
    port,
    deliveryId: required(env, "AIDELIVERY_DELIVERY_ID"),
    candidateSha: required(env, "AIDELIVERY_CANDIDATE_SHA"),
    azureClientId: required(env, "AZURE_CLIENT_ID"),
    speechEndpoint,
    speechResourceId,
    foundryProjectEndpoint: projectEndpoint || compatibilityEndpoint || required(env, "AZURE_AI_PROJECT_ENDPOINT"),
    modelDeployment: required(env, "AZURE_AI_MODEL_DEPLOYMENT_NAME"),
    adapterMode
  };
}
