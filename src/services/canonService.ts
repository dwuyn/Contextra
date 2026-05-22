import { generateText } from "ai";
import type { Prisma } from "@prisma/client";
import { chatModel } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { generateEmbedding, toPgVectorLiteral } from "@/services/ragService";

type ChapterCanonInput = {
  projectId: string;
  chapterId: string;
  branchId: string;
  title: string;
  content: string;
};

type CanonExtraction = {
  entities?: Array<{
    type?: string;
    name?: string;
    aliases?: string[];
    summary?: string;
  }>;
  facts?: Array<{
    entityName?: string;
    kind?: string;
    content?: string;
    importance?: number;
    confidence?: number;
  }>;
  relations?: Array<{
    sourceName?: string;
    targetName?: string;
    relationType?: string;
    summary?: string;
    confidence?: number;
  }>;
  warnings?: string[];
};

type CanonProposalPayload = Record<string, unknown>;

type CanonPromptContextInput = {
  projectId: string;
  currentChapterIndex: number;
  userInstructions: string;
};

const CANON_CONTEXT_BUDGETS = {
  entities: 4_500,
  facts: 6_000,
  relations: 3_000,
};

function stripReasoning(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/u, "$1")
    .trim();
}

function stripHtml(content: string) {
  return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clampConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0.8;
}

function clampImportance(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 1), 5) : 3;
}

function proposalPayload(value: CanonProposalPayload): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function formatPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as Record<string, unknown>;
  return [
    normalizeText(data.name),
    normalizeText(data.entityName),
    normalizeText(data.sourceName),
    normalizeText(data.targetName),
    normalizeText(data.content),
    normalizeText(data.summary),
  ]
    .filter(Boolean)
    .join(" | ");
}

function selectByCharBudget<T>(items: T[], render: (item: T) => string, budget: number) {
  const selected: T[] = [];
  const lines: string[] = [];
  let used = 0;

  for (const item of items) {
    const rendered = render(item).trim();
    if (!rendered) continue;

    const remaining = budget - used;
    if (remaining <= 0) break;

    const line = rendered.length > remaining ? `${rendered.slice(0, Math.max(0, remaining - 3))}...` : rendered;
    selected.push(item);
    lines.push(line);
    used += line.length + 1;
  }

  return { selected, lines };
}

function scoreTextMatch(text: string, loweredInstructions: string) {
  if (!loweredInstructions) return 0;
  return text
    .toLowerCase()
    .split(/\s+/)
    .reduce((score, token) => {
      const cleanToken = token.replace(/[^a-z0-9_-]/g, "");
      if (cleanToken.length < 3) return score;
      return loweredInstructions.includes(cleanToken) ? score + 1 : score;
    }, 0);
}

async function writeVector(table: "CanonEntity" | "CanonFact" | "CanonRelation", id: string, text: string) {
  const cleanText = text.trim();
  if (!cleanText) return;

  try {
    const embedding = await generateEmbedding(cleanText);
    const vectorLiteral = toPgVectorLiteral(embedding);

    if (table === "CanonEntity") {
      await prisma.$executeRaw`UPDATE "CanonEntity" SET "vector" = ${vectorLiteral}::vector WHERE "id" = ${id}`;
      return;
    }

    if (table === "CanonFact") {
      await prisma.$executeRaw`UPDATE "CanonFact" SET "vector" = ${vectorLiteral}::vector WHERE "id" = ${id}`;
      return;
    }

    await prisma.$executeRaw`UPDATE "CanonRelation" SET "vector" = ${vectorLiteral}::vector WHERE "id" = ${id}`;
  } catch (error) {
    console.error("Canon vector write failed; continuing without semantic canon vector.", { table, id }, error);
  }
}

async function extractCanon(input: ChapterCanonInput): Promise<CanonExtraction> {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: {
      name: true,
      summary: true,
      worldRules: true,
      sharedNotes: true,
      characters: {
        orderBy: { updatedAt: "desc" },
        take: 120,
        select: { name: true, role: true, memory: true },
      },
    },
  });

  if (!project) throw new Error("Project not found");

  const prompt = `
You are a continuity editor extracting durable story canon after a chapter save.
Return only JSON. Do not invent facts that are not supported by the chapter.

[PROJECT]
Title: ${project.name}
Summary: ${project.summary}
Synopsis: ${project.sharedNotes || "None"}
World rules: ${toStringList(project.worldRules).join(" | ") || "None"}

[KNOWN CHARACTERS]
${project.characters.map((c) => `- ${c.name} (${c.role}): ${c.memory}`).join("\n") || "- None"}

[CHAPTER]
Title: ${input.title}
Content:
${stripHtml(input.content).slice(0, 24000)}

Return JSON with:
{
  "entities": [
    { "type": "character|place|organization|item|concept|world_rule", "name": "canonical name", "aliases": ["optional"], "summary": "durable description" }
  ],
  "facts": [
    { "entityName": "optional canonical entity", "kind": "character_state|plot|world_rule|timeline|secret|foreshadowing|object_state", "content": "atomic canon fact", "importance": 1-5, "confidence": 0-1 }
  ],
  "relations": [
    { "sourceName": "entity A", "targetName": "entity B", "relationType": "ally|enemy|family|romance|debt|knows_secret|owns|member_of|other", "summary": "relationship update", "confidence": 0-1 }
  ],
  "warnings": ["possible contradiction or continuity risk"]
}
`.trim();

  const { text } = await generateText({
    model: chatModel(),
    prompt,
    temperature: 0.2,
  });

  const cleanText = stripReasoning(text);

  try {
    return JSON.parse(cleanText) as CanonExtraction;
  } catch {
    console.error("Failed to parse canon extraction JSON:", cleanText);
    throw new Error("AI returned invalid JSON during canon extraction.");
  }
}

function buildProposalRows(input: ChapterCanonInput, extraction: CanonExtraction) {
  const rows: Array<{
    projectId: string;
    chapterId: string;
    branchId: string;
    type: string;
    payload: Prisma.InputJsonValue;
    rationale: string;
  }> = [];

  for (const entity of extraction.entities ?? []) {
    const name = normalizeName(entity.name);
    if (!name) continue;
    rows.push({
      projectId: input.projectId,
      chapterId: input.chapterId,
      branchId: input.branchId,
      type: "entity",
      payload: proposalPayload({
        type: normalizeText(entity.type) || "concept",
        name,
        aliases: toStringList(entity.aliases),
        summary: normalizeText(entity.summary),
      }),
      rationale: "Entity extracted from saved chapter.",
    });
  }

  for (const fact of extraction.facts ?? []) {
    const content = normalizeText(fact.content);
    if (!content) continue;
    rows.push({
      projectId: input.projectId,
      chapterId: input.chapterId,
      branchId: input.branchId,
      type: "fact",
      payload: proposalPayload({
        entityName: normalizeName(fact.entityName),
        kind: normalizeText(fact.kind) || "plot",
        content,
        importance: clampImportance(fact.importance),
        confidence: clampConfidence(fact.confidence),
      }),
      rationale: "Canon fact extracted from saved chapter.",
    });
  }

  for (const relation of extraction.relations ?? []) {
    const summary = normalizeText(relation.summary);
    if (!summary) continue;
    rows.push({
      projectId: input.projectId,
      chapterId: input.chapterId,
      branchId: input.branchId,
      type: "relation",
      payload: proposalPayload({
        sourceName: normalizeName(relation.sourceName),
        targetName: normalizeName(relation.targetName),
        relationType: normalizeText(relation.relationType) || "other",
        summary,
        confidence: clampConfidence(relation.confidence),
      }),
      rationale: "Relationship update extracted from saved chapter.",
    });
  }

  for (const warning of extraction.warnings ?? []) {
    const content = normalizeText(warning);
    if (!content) continue;
    rows.push({
      projectId: input.projectId,
      chapterId: input.chapterId,
      branchId: input.branchId,
      type: "continuity_warning",
      payload: proposalPayload({ content }),
      rationale: "Potential continuity issue detected during memory extraction.",
    });
  }

  return rows;
}

export async function createCanonProposalsForChapter(input: ChapterCanonInput) {
  if (!stripHtml(input.content)) {
    await prisma.canonProposal.deleteMany({ where: { chapterId: input.chapterId, status: "pending" } });
    return;
  }

  const extraction = await extractCanon(input);
  const rows = buildProposalRows(input, extraction);

  await prisma.canonProposal.deleteMany({ where: { chapterId: input.chapterId, status: "pending" } });
  if (rows.length === 0) return;

  await prisma.canonProposal.createMany({ data: rows });
}

async function findEntityByName(projectId: string, name: string) {
  if (!name) return null;
  return prisma.canonEntity.findFirst({
    where: {
      projectId,
      name: { equals: name, mode: "insensitive" },
      status: "active",
    },
  });
}

async function getOrCreateEntity(projectId: string, name: string, type = "concept", summary = "") {
  const existing = await findEntityByName(projectId, name);
  if (existing) {
    const nextSummary = summary && !existing.summary.includes(summary) ? summary : existing.summary;
    if (nextSummary !== existing.summary) {
      const updated = await prisma.canonEntity.update({
        where: { id: existing.id },
        data: { summary: nextSummary },
      });
      await writeVector("CanonEntity", updated.id, `${updated.name}. ${updated.summary}`);
      return updated;
    }
    return existing;
  }

  const entity = await prisma.canonEntity.create({
    data: {
      projectId,
      type,
      name,
      summary,
    },
  });
  await writeVector("CanonEntity", entity.id, `${entity.name}. ${entity.summary}`);
  return entity;
}

async function syncCharacterMemory(projectId: string, entityName: string, content: string) {
  if (!entityName || !content) return;
  const character = await prisma.character.findFirst({
    where: { projectId, name: { equals: entityName, mode: "insensitive" } },
    select: { id: true, memory: true },
  });
  if (!character || character.memory.includes(content)) return;

  await prisma.character.update({
    where: { id: character.id },
    data: { memory: `${character.memory.trim()}\nCanon: ${content}`.trim() },
  });
}

async function approveEntity(projectId: string, payload: CanonProposalPayload) {
  const name = normalizeName(payload.name);
  if (!name) return;
  const type = normalizeText(payload.type) || "concept";
  const summary = normalizeText(payload.summary);
  const aliases = toStringList(payload.aliases);

  const entity = await getOrCreateEntity(projectId, name, type, summary);
  if (aliases.length > 0) {
    await prisma.canonEntity.update({
      where: { id: entity.id },
      data: { aliases: aliases as Prisma.InputJsonValue },
    });
  }
}

async function approveFact(projectId: string, proposal: { chapterId: string | null; branchId: string | null; payload: unknown }) {
  const payload = proposal.payload as CanonProposalPayload;
  const content = normalizeText(payload.content);
  if (!content) return;

  const entityName = normalizeName(payload.entityName);
  const entity = entityName ? await getOrCreateEntity(projectId, entityName, "concept") : null;
  const duplicate = await prisma.canonFact.findFirst({
    where: { projectId, content: { equals: content, mode: "insensitive" }, status: "approved" },
    select: { id: true },
  });

  if (!duplicate) {
    const fact = await prisma.canonFact.create({
      data: {
        projectId,
        entityId: entity?.id,
        kind: normalizeText(payload.kind) || "plot",
        content,
        sourceChapterId: proposal.chapterId,
        branchId: proposal.branchId,
        confidence: clampConfidence(payload.confidence),
        importance: clampImportance(payload.importance),
      },
    });
    await writeVector("CanonFact", fact.id, content);
  }

  await syncCharacterMemory(projectId, entityName, content);
}

async function approveRelation(projectId: string, proposal: { chapterId: string | null; payload: unknown }) {
  const payload = proposal.payload as CanonProposalPayload;
  const summary = normalizeText(payload.summary);
  if (!summary) return;

  const sourceName = normalizeName(payload.sourceName);
  const targetName = normalizeName(payload.targetName);
  const source = sourceName ? await getOrCreateEntity(projectId, sourceName, "concept") : null;
  const target = targetName ? await getOrCreateEntity(projectId, targetName, "concept") : null;

  const duplicate = await prisma.canonRelation.findFirst({
    where: { projectId, summary: { equals: summary, mode: "insensitive" }, status: "approved" },
    select: { id: true },
  });
  if (duplicate) return;

  const relation = await prisma.canonRelation.create({
    data: {
      projectId,
      sourceEntityId: source?.id,
      targetEntityId: target?.id,
      relationType: normalizeText(payload.relationType) || "other",
      summary,
      sourceChapterId: proposal.chapterId,
      confidence: clampConfidence(payload.confidence),
    },
  });
  await writeVector("CanonRelation", relation.id, summary);
}

export async function approveCanonProposal(projectId: string, proposalId: string, reviewerUserId: string) {
  const proposal = await prisma.canonProposal.findFirst({
    where: { id: proposalId, projectId, status: "pending" },
  });
  if (!proposal) throw new Error("Canon proposal not found");

  if (proposal.type === "entity") {
    await approveEntity(projectId, proposal.payload as CanonProposalPayload);
  } else if (proposal.type === "fact") {
    await approveFact(projectId, proposal);
  } else if (proposal.type === "relation") {
    await approveRelation(projectId, proposal);
  }

  await prisma.canonProposal.update({
    where: { id: proposal.id },
    data: {
      status: "approved",
      reviewedAt: new Date(),
      reviewedByUserId: reviewerUserId,
    },
  });
}

export async function rejectCanonProposal(projectId: string, proposalId: string, reviewerUserId: string) {
  const proposal = await prisma.canonProposal.findFirst({
    where: { id: proposalId, projectId, status: "pending" },
    select: { id: true },
  });
  if (!proposal) throw new Error("Canon proposal not found");

  await prisma.canonProposal.update({
    where: { id: proposal.id },
    data: {
      status: "rejected",
      reviewedAt: new Date(),
      reviewedByUserId: reviewerUserId,
    },
  });
}

async function semanticCanonHits(projectId: string, query: string, limit = 12) {
  if (!query.trim()) return [];

  try {
    const embedding = await generateEmbedding(query);
    const vectorLiteral = toPgVectorLiteral(embedding);
    const facts = await prisma.$queryRaw<Array<{ content: string; distance: number }>>`
      SELECT "content", "vector" <-> ${vectorLiteral}::vector as distance
      FROM "CanonFact"
      WHERE "projectId" = ${projectId} AND "status" = 'approved' AND "vector" IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${limit}
    `;
    return facts.map((fact) => fact.content);
  } catch (error) {
    console.error("Canon semantic lookup failed; using structured canon fallback.", { projectId }, error);
    return [];
  }
}

export async function loadCanonPromptContext(input: CanonPromptContextInput) {
  const [entities, currentArc, currentBeat, semanticFacts] = await Promise.all([
    prisma.canonEntity.findMany({
      where: { projectId: input.projectId, status: "active" },
      orderBy: [{ updatedAt: "desc" }],
      take: 160,
      select: {
        id: true,
        type: true,
        name: true,
        aliases: true,
        summary: true,
        updatedAt: true,
      },
    }),
    prisma.storyArc.findFirst({
      where: {
        projectId: input.projectId,
        OR: [
          {
            startChapterIndex: { lte: input.currentChapterIndex },
            endChapterIndex: { gte: input.currentChapterIndex },
          },
          { startChapterIndex: null, endChapterIndex: null },
        ],
      },
      orderBy: [{ sortOrder: "asc" }],
    }),
    prisma.outlineBeat.findFirst({
      where: { projectId: input.projectId, chapterIndex: input.currentChapterIndex },
    }),
    semanticCanonHits(input.projectId, input.userInstructions, 16),
  ]);

  const loweredInstructions = input.userInstructions.toLowerCase();
  const rankedEntities = entities
    .map((entity) => {
      const aliases = toStringList(entity.aliases);
      const exactAliasHit = [entity.name, ...aliases].some((name) => loweredInstructions.includes(name.toLowerCase()));
      const score = (exactAliasHit ? 10 : 0) + scoreTextMatch(`${entity.name} ${aliases.join(" ")} ${entity.summary}`, loweredInstructions);
      return { ...entity, score };
    })
    .sort((a, b) => b.score - a.score || b.updatedAt.getTime() - a.updatedAt.getTime());

  const entitySelection = selectByCharBudget(
    rankedEntities,
    (entity) => {
      const aliases = toStringList(entity.aliases);
      return `${entity.name} [${entity.type}]${aliases.length ? ` aka ${aliases.join(", ")}` : ""}: ${entity.summary || "No summary."}`;
    },
    CANON_CONTEXT_BUDGETS.entities,
  );
  const selectedEntityIds = entitySelection.selected.map((entity) => entity.id);

  const [facts, relations] = await Promise.all([
    prisma.canonFact.findMany({
      where: {
        projectId: input.projectId,
        status: "approved",
        OR: selectedEntityIds.length ? [{ entityId: { in: selectedEntityIds } }, { importance: { gte: 4 } }] : undefined,
      },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
    prisma.canonRelation.findMany({
      where: {
        projectId: input.projectId,
        status: "approved",
        OR: selectedEntityIds.length
          ? [{ sourceEntityId: { in: selectedEntityIds } }, { targetEntityId: { in: selectedEntityIds } }]
          : undefined,
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 80,
    }),
  ]);

  const factLines = [
    ...new Set([
      ...facts.map((fact) => `${fact.kind}: ${fact.content}`),
      ...semanticFacts.map((fact) => `semantic: ${fact}`),
    ]),
  ];

  return {
    currentArc: currentArc
      ? `${currentArc.title}: ${currentArc.summary || "No arc summary."} (${currentArc.startChapterIndex ?? "?"}-${currentArc.endChapterIndex ?? "?"})`
      : "No active long-form arc.",
    currentBeat: currentBeat
      ? `Chapter ${currentBeat.chapterIndex ?? input.currentChapterIndex}: ${currentBeat.title}. ${currentBeat.summary}`
      : "No approved beat for this chapter index.",
    entities: entitySelection.lines,
    facts: selectByCharBudget(factLines, (fact) => fact, CANON_CONTEXT_BUDGETS.facts).lines,
    relations: selectByCharBudget(
      relations,
      (relation) => `${relation.relationType}: ${relation.summary}`,
      CANON_CONTEXT_BUDGETS.relations,
    ).lines,
  };
}

export function summarizeCanonProposal(proposal: { type: string; payload: unknown }) {
  const detail = formatPayload(proposal.payload);
  return detail ? `${proposal.type}: ${detail}` : proposal.type;
}
