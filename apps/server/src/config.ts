export type Environment = Record<string, string | undefined>;

export interface ServerConfig {
  port: number;
  publicOrigin: string;
  speechRegion: string;
  speechKey: string;
  speechSourceLanguagesJson: string;
  speechCatalogVersion: string;
  foundryEndpoint: string;
  foundryDeployment: "gpt-sol-6.1";
}

export type ConfigResult =
  | { ready: true; config: ServerConfig }
  | { ready: false; issues: string[] };

const requiredKeys = [
  "PORT",
  "PUBLIC_ORIGIN",
  "SPEECH_REGION",
  "SPEECH_KEY",
  "SPEECH_SOURCE_LANGUAGES_JSON",
  "SPEECH_CATALOG_VERSION",
  "AZURE_FOUNDRY_ENDPOINT",
  "AZURE_FOUNDRY_DEPLOYMENT",
] as const;

function isSecureUrl(value: string, allowLoopback: boolean): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (allowLoopback &&
        url.protocol === "http:" &&
        (url.hostname === "127.0.0.1" ||
          url.hostname === "localhost" ||
          url.hostname === "::1"))
    );
  } catch {
    return false;
  }
}

export function loadConfig(environment: Environment): ConfigResult {
  const issues: string[] = [];

  for (const key of requiredKeys) {
    if (!environment[key]?.trim()) {
      issues.push(`${key} is required`);
    }
  }

  const port = Number(environment.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    issues.push("PORT must be an integer from 1 to 65535");
  }

  const publicOrigin = environment.PUBLIC_ORIGIN ?? "";
  if (!isSecureUrl(publicOrigin, true)) {
    issues.push("PUBLIC_ORIGIN must use HTTPS or a loopback HTTP origin");
  }

  const foundryEndpoint = environment.AZURE_FOUNDRY_ENDPOINT ?? "";
  if (!isSecureUrl(foundryEndpoint, false)) {
    issues.push("AZURE_FOUNDRY_ENDPOINT must use HTTPS");
  }

  try {
    const catalog = JSON.parse(
      environment.SPEECH_SOURCE_LANGUAGES_JSON ?? "",
    ) as unknown;
    if (!Array.isArray(catalog) || catalog.length === 0) {
      issues.push("SPEECH_SOURCE_LANGUAGES_JSON must be a non-empty array");
    }
  } catch {
    issues.push("SPEECH_SOURCE_LANGUAGES_JSON must be valid JSON");
  }

  if (environment.AZURE_FOUNDRY_DEPLOYMENT !== "gpt-sol-6.1") {
    issues.push("AZURE_FOUNDRY_DEPLOYMENT must be gpt-sol-6.1");
  }

  if (issues.length > 0) {
    return { ready: false, issues };
  }

  return {
    ready: true,
    config: {
      port,
      publicOrigin,
      speechRegion: environment.SPEECH_REGION!,
      speechKey: environment.SPEECH_KEY!,
      speechSourceLanguagesJson:
        environment.SPEECH_SOURCE_LANGUAGES_JSON!,
      speechCatalogVersion: environment.SPEECH_CATALOG_VERSION!,
      foundryEndpoint,
      foundryDeployment: "gpt-sol-6.1",
    },
  };
}
