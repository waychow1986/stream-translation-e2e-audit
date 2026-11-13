import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import type { AppConfig } from "../config.js";
import { FoundryTranslator } from "./foundry.js";

export function createAzureFoundryTranslator(config: AppConfig): FoundryTranslator {
  const credential = new DefaultAzureCredential({ managedIdentityClientId: config.azureClientId });
  const project = new AIProjectClient(config.foundryProjectEndpoint, credential);
  return new FoundryTranslator(async (request) => {
    const openAI = await project.getAzureOpenAIClient();
    const pending = openAI.chat.completions.create({
      model: config.modelDeployment,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.input }
      ],
      stream: true,
      reasoning_effort: request.reasoning_effort as never
    }, { signal: request.signal });
    const { data: response, request_id: requestId } = await pending.withResponse();
    const deltas: string[] = [];
    for await (const event of response) {
      const delta = event.choices[0]?.delta?.content;
      if (delta) deltas.push(delta);
    }
    if (!requestId || deltas.length === 0) throw new Error("Foundry stream returned incomplete metadata");
    return { requestId, deltas };
  });
}
