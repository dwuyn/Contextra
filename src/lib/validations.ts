import { z } from "zod";

const RegisterSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })).min(1).max(100),
  projectId: z.uuid(),
  branchId: z.uuid(),
});

export const RenameProjectSchema = z.object({
  name: z.string().min(1).max(200),
});

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
  expectedUpdatedAt: z.string().optional(),
});

export const GenerateChapterIllustrationSchema = z.object({
  chapterTitle: z.string().trim().min(1).max(200),
  chapterContent: z.string().trim().min(1).max(250_000),
  customInstruction: z.string().trim().max(2_000).optional(),
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

const OutlineChapterSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).default(""),
});

const OutlineActSchema = z.object({
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

export const OutlineRequestSchema = z.object({
  targetChapterCount: z.number().int().min(1).max(100).optional(),
});

const GeneratedOutlineChapterSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).default(""),
});

const GeneratedOutlineActSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).default(""),
  chapters: z.array(GeneratedOutlineChapterSchema).default([]),
});

export const GeneratedOutlineSchema = z.object({
  acts: z.array(GeneratedOutlineActSchema).min(1),
});

const GeneratedLongOutlineBeatSchema = z.object({
  chapterIndex: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).default(""),
  focusEntities: z.array(z.string()).default([]),
});

const GeneratedLongOutlineArcSchema = z.object({
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
  fileUrl: z.string().url().refine((url) => url.startsWith("https://"), "Only HTTPS URLs are allowed").optional(),
});

export const ProjectAiChatRequestSchema = z.object({
  projectId: z.string().min(1),
  branchId: z.string().min(1),
  content: z.string().trim().min(1),
});

export const CreatePronunciationEntrySchema = z.object({
  projectId: z.uuid(),
  language: z.enum(["en-US", "vi-VN"]),
  term: z.string().min(1).max(200),
  replacement: z.string().min(1).max(500),
  renderMode: z.enum(["sub", "phoneme", "say_as", "plain"]),
  matchMode: z.enum(["whole_word", "literal"]),
  caseSensitive: z.boolean().optional().default(false),
  priority: z.number().int().optional().default(0),
  notes: z.string().max(1000).optional().default(""),
});

export const UpdatePronunciationEntrySchema = z.object({
  id: z.uuid(),
  term: z.string().min(1).max(200).optional(),
  replacement: z.string().min(1).max(500).optional(),
  renderMode: z.enum(["sub", "phoneme", "say_as", "plain"]).optional(),
  matchMode: z.enum(["whole_word", "literal"]).optional(),
  caseSensitive: z.boolean().optional(),
  priority: z.number().int().optional(),
  notes: z.string().max(1000).optional(),
});

const ImportPronunciationSuggestionsSchema = z.object({
  projectId: z.uuid(),
  language: z.enum(["en-US", "vi-VN"]),
});
