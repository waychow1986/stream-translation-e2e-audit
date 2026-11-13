import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

export function createAzureCredential(clientId: string) {
  return new DefaultAzureCredential({ managedIdentityClientId: clientId });
}

export function createCognitiveTokenProvider(credential: DefaultAzureCredential) {
  return getBearerTokenProvider(credential, "https://cognitiveservices.azure.com/.default");
}
