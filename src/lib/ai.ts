import { createVertex } from "@ai-sdk/google-vertex";

const project = process.env.GOOGLE_CLOUD_PROJECT;
if (!project) {
  throw new Error("Missing required env var: GOOGLE_CLOUD_PROJECT");
}

const location = process.env.GOOGLE_CLOUD_LOCATION;
if (!location) {
  throw new Error("Missing required env var: GOOGLE_CLOUD_LOCATION");
}

const aiChatModel = process.env.AI_CHAT_MODEL || "gemini-2.5-flash";
const aiEmbeddingModel = process.env.AI_EMBEDDING_MODEL || "gemini-embedding-001";
const aiEmbeddingDimensions = Number(process.env.AI_EMBEDDING_DIMENSIONS) || 768;

const vertex = createVertex({
  project,
  location,
});

export function chatModel(modelId: string = aiChatModel) {
  return vertex.languageModel(modelId);
}

export function embeddingModel() {
  const baseModel = vertex.embeddingModel(aiEmbeddingModel);

  return Object.assign(Object.create(Object.getPrototypeOf(baseModel)), baseModel, {
    doEmbed(options: Parameters<typeof baseModel.doEmbed>[0]) {
      return baseModel.doEmbed({
        ...options,
        providerOptions: {
          ...options.providerOptions,
          vertex: {
            ...options.providerOptions?.vertex,
            outputDimensionality: aiEmbeddingDimensions,
          },
        },
      });
    },
  }) as typeof baseModel;
}
