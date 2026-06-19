import { createVertex } from "@ai-sdk/google-vertex";

let cachedVertex: ReturnType<typeof createVertex> | null = null;
let cachedImageVertex: ReturnType<typeof createVertex> | null = null;

function requireEnv(name: "GOOGLE_CLOUD_PROJECT" | "GOOGLE_CLOUD_LOCATION") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

function getChatModelId() {
  return process.env.AI_CHAT_MODEL || "gemini-2.5-flash";
}

function getEmbeddingModelId() {
  return process.env.AI_EMBEDDING_MODEL || "gemini-embedding-001";
}

function getImageModelId() {
  return process.env.AI_IMAGE_MODEL || "imagen-4.0-generate-001";
}

function getEmbeddingDimensions() {
  const dimensions = Number(process.env.AI_EMBEDDING_DIMENSIONS);
  return Number.isFinite(dimensions) && dimensions > 0 ? dimensions : 768;
}

// Builds can import this module while collecting route data, so defer provider
// initialization until an AI-backed path actually executes.
function getVertex() {
  cachedVertex ??= createVertex({
    project: requireEnv("GOOGLE_CLOUD_PROJECT"),
    location: requireEnv("GOOGLE_CLOUD_LOCATION"),
  });

  return cachedVertex;
}

function getImageVertex() {
  cachedImageVertex ??= createVertex({
    project: requireEnv("GOOGLE_CLOUD_PROJECT"),
    location: process.env.AI_IMAGE_LOCATION?.trim() || "global",
  });

  return cachedImageVertex;
}

export function chatModel(modelId: string = getChatModelId()) {
  return getVertex().languageModel(modelId);
}

export function embeddingModel() {
  const baseModel = getVertex().embeddingModel(getEmbeddingModelId());
  const outputDimensionality = getEmbeddingDimensions();

  return Object.assign(Object.create(Object.getPrototypeOf(baseModel)), baseModel, {
    doEmbed(options: Parameters<typeof baseModel.doEmbed>[0]) {
      return baseModel.doEmbed({
        ...options,
        providerOptions: {
          ...options.providerOptions,
          vertex: {
            ...options.providerOptions?.vertex,
            outputDimensionality,
          },
        },
      });
    },
  }) as typeof baseModel;
}

export function imageModel(modelId: string = getImageModelId()) {
  return getImageVertex().imageModel(modelId);
}
