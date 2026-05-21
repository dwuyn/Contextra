import { z } from "zod";

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  mode: z.string(),
  genre: z.string(),
  summary: z.string(),
  isPublic: z.boolean().optional(),
  coverImageUrl: z.string().optional()
});

export const UpdateProjectSettingsSchema = z.object({
  mode: z.string().optional(),
  isPublic: z.boolean().optional(),
  coverImageUrl: z.string().optional(),
  summary: z.string().optional(),
  genre: z.string().optional()
});

export const CreateChapterSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  content: z.string().optional(),
  branchId: z.string().min(1)
});

export const UpdateChapterSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  content: z.string().optional(),
  createVersion: z.boolean().optional(),
  revalidate: z.boolean().optional(),
});

export const CreateBranchSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  basedOnChapterId: z.string().min(1)
});

export const UpsertCharacterSchema = z.object({
  name: z.string().min(1),
  role: z.string(),
  memory: z.string()
});

export const OutlineChapterSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).default(""),
});

export const OutlineActSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).default(""),
  chapters: z.array(OutlineChapterSchema).default([]),
});

export const ProjectOutlineSchema = z.object({
  acts: z.array(OutlineActSchema).default([]),
});

export const LongOutlineRequestSchema = z.object({
  targetChapterCount: z.number().int().min(20).max(1000).default(200),
});

export const GeneratedOutlineChapterSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).default(""),
});

export const GeneratedOutlineActSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).default(""),
  chapters: z.array(GeneratedOutlineChapterSchema).default([]),
});

export const GeneratedOutlineSchema = z.object({
  acts: z.array(GeneratedOutlineActSchema).min(1),
});

export const GeneratedLongOutlineBeatSchema = z.object({
  chapterIndex: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).default(""),
  focusEntities: z.array(z.string()).default([]),
});

export const GeneratedLongOutlineArcSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).default(""),
  startChapterIndex: z.number().int().min(1),
  endChapterIndex: z.number().int().min(1),
  beats: z.array(GeneratedLongOutlineBeatSchema).default([]),
});

export const GeneratedLongOutlineSchema = z.object({
  arcs: z.array(GeneratedLongOutlineArcSchema).min(1),
});

export const UpdateContextSchema = z.object({
  tone: z.string().optional(),
  audience: z.string().optional(),
  sharedNotes: z.string().optional(),
  worldRules: z.unknown().optional()
});

export const UpdateOutlineSchema = ProjectOutlineSchema;

export const AddCollaboratorSchema = z.object({
  friendUserId: z.string().min(1),
  permissionLevel: z.number().int().min(1).max(3)
});

export const CreateProjectInviteSchema = z.object({
  receiverUserId: z.string().min(1),
  permissionLevel: z.number().int().min(1).max(3),
});

export const RemoveProjectMemberSchema = z.object({
  memberUserId: z.string().min(1),
});

export const RespondProjectInviteSchema = z.object({
  status: z.enum(["accepted", "declined"]),
});

export const UpsertProjectPresenceSchema = z.object({
  chapterId: z.string().min(1).nullable().optional(),
  state: z.enum(["viewing", "editing"]),
});

export const CreateCommentThreadSchema = z.object({
  threadId: z.string().min(1),
  chapterId: z.string().min(1),
  selectedText: z.string().trim().min(1),
  content: z.string().trim().min(1),
  chapterContent: z.string().min(1),
});

export const ReplyToCommentThreadSchema = z.object({
  content: z.string().trim().min(1),
});

export const UpdateCommentThreadStatusSchema = z.object({
  status: z.enum(["open", "resolved"]),
});

export const SendProjectChatSchema = z.object({
  content: z.string().min(1),
  fileName: z.string().optional(),
  fileUrl: z.string().optional()
});

export const ProjectAiChatRequestSchema = z.object({
  projectId: z.string().min(1),
  branchId: z.string().min(1),
  content: z.string().trim().min(1),
});
