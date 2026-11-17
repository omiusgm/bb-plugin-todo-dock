import { z } from "zod";
import { defineRpcContract } from "@get-bb/plugin-sdk";

export const STATUSES = ["queue", "in_progress", "in_review", "done", "canceled"] as const;
export const statusSchema = z.enum(STATUSES);
export type GoalStatus = z.infer<typeof statusSchema>;
export const importanceSchema = z.enum(["urgent", "important", "normal", "later"]);
export type Importance = z.infer<typeof importanceSchema>;
export const requestedBySchema = z.enum(["user", "self"]);
export type RequestedBy = z.infer<typeof requestedBySchema>;
export const originSchema = z.enum(["manual", "user-request", "agent-self"]);
export type GoalOrigin = z.infer<typeof originSchema>;

/** Stable wire shape shared by the page, dock and agent tools. */
export const dockTaskSchema = z.object({
  id: z.string(), key: z.string(), projectId: z.string(),
  bbProjectId: z.string().nullable(), title: z.string(), status: statusSchema,
  priority: z.string(), parentTaskId: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(), doneAt: z.string().nullable(),
  threadIds: z.array(z.string()), origin: originSchema, importance: importanceSchema,
  requestedBy: requestedBySchema, summary: z.string().nullable(), ownerThreadId: z.string().nullable(),
});
export type DockTask = z.infer<typeof dockTaskSchema>;
export type Goal = DockTask;
export const dockProjectSchema = z.object({
  id: z.string(), name: z.string(), prefix: z.string(), bbProjectId: z.string().nullable(),
});
export type DockProject = z.infer<typeof dockProjectSchema>;
export const dockSpaceSchema = z.object({
  id: z.string(), name: z.string(), icon: z.string(), projectIds: z.array(z.string()),
});
export type DockSpace = z.infer<typeof dockSpaceSchema>;
export const spacesStateSchema = z.object({
  spaces: z.array(dockSpaceSchema), activeSpaceId: z.string().nullable(),
});
export const overviewFiltersSchema = z.object({
  bbProjectId: z.string().optional(), spaceId: z.string().optional(),
  origin: z.enum(["user", "agent", "all"]).optional(),
  statuses: z.array(statusSchema).optional(), includeClosed: z.boolean().optional(),
});
export type OverviewFilters = z.infer<typeof overviewFiltersSchema>;
const overviewOutput = z.object({
  ok: z.boolean(), error: z.string().nullable(), projects: z.array(dockProjectSchema),
  tasks: z.array(dockTaskSchema), goals: z.array(dockTaskSchema),
  spaces: z.array(dockSpaceSchema), activeSpaceId: z.string().nullable(),
});
const addInput = z.object({
  bbProjectId: z.string().startsWith("proj_"), title: z.string().trim().min(1).max(300),
  status: z.enum(["queue", "todo", "in_progress"]).default("queue")
    .transform((status) => status === "todo" ? "queue" as const : status),
});
const idInput = z.object({ taskId: z.string().min(1) });
const removeOutput = z.object({ removed: z.boolean() });

/** Importance is assigned by agent tools, never by a page mutation. */
export const goalsRpcMethods = {
  overview: { input: z.union([z.null(), overviewFiltersSchema]), output: overviewOutput },
  add: { input: addInput, output: dockTaskSchema },
  addTask: { input: addInput, output: dockTaskSchema },
  setStatus: { input: idInput.extend({ status: statusSchema }), output: dockTaskSchema },
  accept: { input: idInput, output: dockTaskSchema },
  reopen: { input: idInput, output: dockTaskSchema },
  remove: { input: idInput, output: removeOutput },
  removeTask: { input: idInput, output: removeOutput },
};
export const goalsContract = defineRpcContract(goalsRpcMethods);
