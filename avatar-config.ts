import { z } from "zod";

export const CODEX_MODELS = ["codex", "hoots", "rocky", "seedy", "fireball", "stacky", "dewey"] as const;
export const CLAUDE_MODELS = ["crab", "crab-hermit", "crab-round", "crab-pixel", "clawd", "clawd-headphones", "clawd-hat", "clawd-coffee"] as const;
export const AVATAR_MODELS = [...CODEX_MODELS, ...CLAUDE_MODELS] as const;
export const avatarModelSchema = z.enum(AVATAR_MODELS);
export type AvatarModel = z.infer<typeof avatarModelSchema>;
export const avatarSettingsSchema = z.object({
  per: z.enum(["one", "thread"]).default("one"),
  codex: z.enum(CODEX_MODELS).default("codex"),
  claude: z.enum(CLAUDE_MODELS).default("crab"),
  color: z.enum(["project", "single"]).default("project"),
  anim: z.enum(["all", "roots", "off"]).default("roots"),
  speed: z.union([z.literal(0.6), z.literal(1), z.literal(1.5)]).default(1),
  size: z.union([z.literal(32), z.literal(40), z.literal(48)]).default(40),
  joy: z.boolean().default(true),
  badges: z.boolean().default(true),
  sleep: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(60)]).default(20),
  hybridAnimation: z.enum(["animate", "static"]).default("animate"),
});
export type AvatarSettings = z.infer<typeof avatarSettingsSchema>;
export const DEFAULT_AVATAR_SETTINGS: AvatarSettings = avatarSettingsSchema.parse({});
