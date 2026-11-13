export interface AppConfig {
  port: number;
  deliveryId: string;
  candidateSha: string;
  azureClientId: string;
  speechEndpoint: string;
  speechResourceId: string;
  aiProjectEndpoint: string;
  modelDeployment: string;
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function httpsUrl(value: string, name: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(`${name} must be a credential-free HTTPS URL`);
  return url.origin + url.pathname.replace(/\/$/, "");
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const port = Number(required(env, "PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid port");
  const speechResourceId = required(env, "AZURE_SPEECH_RESOURCE_ID");
  if (!/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.CognitiveServices\/accounts\/[^/]+$/i.test(speechResourceId)) {
    throw new Error("AZURE_SPEECH_RESOURCE_ID must be an absolute Speech ARM resource ID");
  }
  const projectEndpoint = env.AZURE_AI_PROJECT_ENDPOINT?.trim() || env.FOUNDRY_PROJECT_ENDPOINT?.trim();
  if (!projectEndpoint) throw new Error("Missing required environment variable: AZURE_AI_PROJECT_ENDPOINT or FOUNDRY_PROJECT_ENDPOINT");
  return {
    port,
    deliveryId: required(env, "AIDELIVERY_DELIVERY_ID"),
    candidateSha: required(env, "AIDELIVERY_CANDIDATE_SHA"),
    azureClientId: required(env, "AZURE_CLIENT_ID"),
    speechEndpoint: httpsUrl(required(env, "AZURE_SPEECH_ENDPOINT"), "AZURE_SPEECH_ENDPOINT"),
    speechResourceId,
    aiProjectEndpoint: httpsUrl(projectEndpoint, "AZURE_AI_PROJECT_ENDPOINT"),
    modelDeployment: required(env, "AZURE_AI_MODEL_DEPLOYMENT_NAME")
  };
}
