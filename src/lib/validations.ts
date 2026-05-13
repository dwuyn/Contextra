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
  content: z.string().optional()
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

export const UpdateContextSchema = z.object({
  tone: z.string().optional(),
  audience: z.string().optional(),
  sharedNotes: z.string().optional(),
  worldRules: z.any().optional()
});

export const AddCollaboratorSchema = z.object({
  friendUserId: z.string().min(1),
  permissionLevel: z.number().int().min(1).max(3)
});

export const SendProjectChatSchema = z.object({
  content: z.string().min(1),
  fileName: z.string().optional(),
  fileUrl: z.string().optional()
});
