import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { summarizeAgentAnswer } from "./summary.ts";
import {
  type DockProject, type DockTask, type GoalOrigin, type GoalStatus,
  type Importance, type OverviewFilters, type RequestedBy, STATUSES,
} from "./goals-contract.ts";

// Append new statements only. The host checks the hash of every applied index.
export const GOALS_MIGRATIONS = [
  `CREATE TABLE goal_projects (
    id TEXT PRIMARY KEY, bb_project_id TEXT UNIQUE, name TEXT NOT NULL,
    prefix TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE goals (
    id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, bb_project_id TEXT,
    project_id TEXT NOT NULL, title TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('queue','in_progress','in_review','done','canceled')),
    importance TEXT NOT NULL CHECK(importance IN ('urgent','important','normal','later')),
    origin TEXT NOT NULL CHECK(origin IN ('manual','user-request','agent-self')),
    requested_by TEXT NOT NULL CHECK(requested_by IN ('user','self')),
    owner_thread_id TEXT, summary TEXT, parent_task_id TEXT, priority TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, done_at TEXT
  )`,
  `CREATE TABLE goal_thread_links (
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL, PRIMARY KEY(goal_id, thread_id)
  )`,
  `CREATE INDEX goals_project_status ON goals(bb_project_id, status)`,
  `CREATE INDEX goals_owner_status ON goals(owner_thread_id, status)`,
  `ALTER TABLE goal_projects ADD COLUMN next_number INTEGER NOT NULL DEFAULT 1`,
];

const PRIORITY: Record<Importance, string> = {
  urgent: "urgent", important: "high", normal: "none", later: "low",
};
export function importanceFromPriority(priority: string): Importance {
  return priority === "urgent" ? "urgent" : priority === "high" ? "important"
    : priority === "low" ? "later" : "normal";
}
const TRANSLIT: Record<string, string> = {
  а: "A", б: "B", в: "V", г: "G", д: "D", е: "E", ё: "E", ж: "ZH", з: "Z",
  и: "I", й: "Y", к: "K", л: "L", м: "M", н: "N", о: "O", п: "P", р: "R",
  с: "S", т: "T", у: "U", ф: "F", х: "H", ц: "C", ч: "CH", ш: "SH", щ: "SH",
  ъ: "", ы: "Y", ь: "", э: "E", ю: "YU", я: "YA",
};
function derivePrefix(name: string, taken: Set<string>): string {
  const latin = [...name.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch.toUpperCase()).join("").replace(/[^A-Z0-9]/g, "");
  const base = (latin.match(/^[A-Z]/) ? latin : `P${latin}`).slice(0, 5) || "P";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, Math.max(1, 10 - String(n).length))}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

type GoalRow = {
  id: string; key: string; bb_project_id: string | null; project_id: string; title: string;
  status: GoalStatus; importance: Importance; origin: GoalOrigin; requested_by: RequestedBy;
  owner_thread_id: string | null; summary: string | null; parent_task_id: string | null;
  priority: string; created_at: string; updated_at: string; done_at: string | null;
};
type ProjectRow = { id: string; bb_project_id: string | null; name: string; prefix: string };
export type CreateGoalInput = {
  bbProjectId: string; title: string; status?: GoalStatus; ownerThreadId?: string | null;
  importance?: Importance; requestedBy?: RequestedBy; origin?: GoalOrigin; summary?: string | null;
};
export type GoalMetadataPatch = Partial<Pick<DockTask,
  "title" | "importance" | "origin" | "requestedBy" | "summary" | "ownerThreadId">>;

export function createGoalsStore(bb: Pick<BbPluginApi, "storage">) {
  const db = bb.storage.database();
  bb.storage.migrate(db, GOALS_MIGRATIONS);
  const projectFromRow = (row: ProjectRow): DockProject => ({
    id: row.id, name: row.name, prefix: row.prefix, bbProjectId: row.bb_project_id,
  });
  function decorate(row: GoalRow): DockTask {
    return {
      id: row.id, key: row.key, bbProjectId: row.bb_project_id, projectId: row.project_id,
      title: row.title, status: row.status, importance: row.importance, origin: row.origin,
      requestedBy: row.requested_by, priority: row.priority, ownerThreadId: row.owner_thread_id,
      summary: row.summary, parentTaskId: row.parent_task_id, createdAt: row.created_at,
      updatedAt: row.updated_at, doneAt: row.done_at,
      threadIds: (db.prepare("SELECT thread_id FROM goal_thread_links WHERE goal_id = ? ORDER BY rowid").all(row.id) as { thread_id: string }[]).map((link) => link.thread_id),
    };
  }
  function get(id: string): DockTask | null {
    const row = db.prepare("SELECT * FROM goals WHERE id = ?").get(id) as GoalRow | undefined;
    return row ? decorate(row) : null;
  }
  function requireGoal(id: string): DockTask {
    const goal = get(id);
    if (!goal) throw new Error("Цель не найдена");
    return goal;
  }
  function projects(): DockProject[] {
    return (db.prepare("SELECT * FROM goal_projects ORDER BY rowid").all() as ProjectRow[]).map(projectFromRow);
  }
  function link(id: string, threadId: string): void {
    requireGoal(id);
    db.prepare("INSERT OR IGNORE INTO goal_thread_links (goal_id, thread_id) VALUES (?, ?)").run(id, threadId);
  }
  function ensureProject(bbProjectId: string, name: string): DockProject {
    const found = db.prepare("SELECT * FROM goal_projects WHERE bb_project_id = ?").get(bbProjectId) as ProjectRow | undefined;
    if (found) {
      if (found.name !== name) db.prepare("UPDATE goal_projects SET name = ? WHERE id = ?").run(name, found.id);
      return { ...projectFromRow(found), name };
    }
    const project = { id: `goalproj_${randomUUID()}`, bbProjectId, name, prefix: derivePrefix(name, new Set(projects().map((p) => p.prefix))) };
    db.prepare("INSERT INTO goal_projects (id, bb_project_id, name, prefix) VALUES (?, ?, ?, ?)").run(project.id, bbProjectId, name, project.prefix);
    return project;
  }
  const insertGoal = db.prepare(`INSERT OR IGNORE INTO goals
    (id, key, bb_project_id, project_id, title, status, importance, origin, requested_by,
    owner_thread_id, summary, parent_task_id, priority, created_at, updated_at, done_at)
    VALUES (@id, @key, @bb_project_id, @project_id, @title, @status, @importance, @origin,
    @requested_by, @owner_thread_id, @summary, @parent_task_id, @priority, @created_at, @updated_at, @done_at)`);
  const store = {
    projects, get, ensureProject, link,
    byKey(key: string): DockTask | null {
      const row = db.prepare("SELECT * FROM goals WHERE key = ?").get(key.toUpperCase()) as GoalRow | undefined;
      return row ? decorate(row) : null;
    },
    list(filters: Omit<OverviewFilters, "spaceId"> = {}): DockTask[] {
      const clauses: string[] = [];
      const values: string[] = [];
      if (filters.bbProjectId) { clauses.push("bb_project_id = ?"); values.push(filters.bbProjectId); }
      if (filters.origin === "agent") clauses.push("origin = 'agent-self'");
      if (filters.origin === "user") clauses.push("origin IN ('manual', 'user-request')");
      if (filters.statuses) {
        if (!filters.statuses.length) return [];
        clauses.push(`status IN (${filters.statuses.map(() => "?").join(",")})`);
        values.push(...filters.statuses);
      }
      if (filters.includeClosed === false) clauses.push("status NOT IN ('done', 'canceled')");
      const rows = db.prepare(`SELECT * FROM goals${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY updated_at DESC, rowid DESC`).all(...values) as GoalRow[];
      return rows.map(decorate);
    },
    create(input: CreateGoalInput): DockTask {
      return db.transaction(() => {
        const project = projects().find((p) => p.bbProjectId === input.bbProjectId);
        if (!project) throw new Error("Сначала создайте проект целей через ensureProject");
        let sequence = (db.prepare("SELECT next_number FROM goal_projects WHERE id = ?").get(project.id) as { next_number: number }).next_number;
        for (const row of db.prepare("SELECT key FROM goals WHERE project_id = ?").all(project.id) as { key: string }[]) {
          const suffix = row.key.startsWith(`${project.prefix}-`) ? Number(row.key.slice(project.prefix.length + 1)) : NaN;
          if (Number.isInteger(suffix)) sequence = Math.max(sequence, suffix + 1);
        }
        while (store.byKey(`${project.prefix}-${sequence}`)) sequence += 1;
        db.prepare("UPDATE goal_projects SET next_number = ? WHERE id = ?").run(sequence + 1, project.id);
        const now = new Date().toISOString();
        const status = input.status ?? "queue";
        const importance = input.importance ?? "normal";
        const requestedBy = input.requestedBy ?? "user";
        const origin = input.origin ?? (input.ownerThreadId ? requestedBy === "self" ? "agent-self" : "user-request" : "manual");
        const id = `goal_${randomUUID()}`;
        insertGoal.run({ id, key: `${project.prefix}-${sequence}`, bb_project_id: input.bbProjectId,
          project_id: project.id, title: input.title, status, importance, origin, requested_by: requestedBy,
          owner_thread_id: input.ownerThreadId ?? null, summary: input.summary ?? null, parent_task_id: null,
          priority: PRIORITY[importance], created_at: now, updated_at: now, done_at: status === "done" ? now : null });
        if (input.ownerThreadId) link(id, input.ownerThreadId);
        return requireGoal(id);
      })();
    },
    setStatus(id: string, status: GoalStatus): DockTask {
      const goal = requireGoal(id);
      if (goal.status === status) return goal;
      const now = new Date().toISOString();
      db.prepare("UPDATE goals SET status = ?, updated_at = ?, done_at = ? WHERE id = ?").run(status, now, status === "done" ? now : null, id);
      return requireGoal(id);
    },
    update(id: string, patch: GoalMetadataPatch): DockTask {
      const goal = requireGoal(id);
      const next = { ...goal, ...patch };
      db.prepare(`UPDATE goals SET title = ?, importance = ?, priority = ?, origin = ?,
        requested_by = ?, summary = ?, owner_thread_id = ?, updated_at = ? WHERE id = ?`).run(
        next.title, next.importance, patch.importance ? PRIORITY[patch.importance] : goal.priority,
        next.origin, next.requestedBy, next.summary, next.ownerThreadId, new Date().toISOString(), id);
      if (next.ownerThreadId) link(id, next.ownerThreadId);
      return requireGoal(id);
    },
    remove(id: string): boolean {
      return db.transaction(() => {
        db.prepare("DELETE FROM goal_thread_links WHERE goal_id = ?").run(id);
        return db.prepare("DELETE FROM goals WHERE id = ?").run(id).changes > 0;
      })();
    },
    /** Migration-only: a complete snapshot is written atomically after all reads succeed. */
    importSnapshot(snapshot: { projects: DockProject[]; goals: DockTask[] }): number {
      return db.transaction(() => {
        const projectIds = new Map<string, string>();
        for (const project of snapshot.projects) {
          const current = projects().find((existing) => existing.id === project.id ||
            (project.bbProjectId !== null && existing.bbProjectId === project.bbProjectId));
          if (current) { projectIds.set(project.id, current.id); continue; }
          const taken = new Set(projects().map((existing) => existing.prefix));
          const prefix = taken.has(project.prefix) ? derivePrefix(project.name, taken) : project.prefix;
          db.prepare("INSERT INTO goal_projects (id, bb_project_id, name, prefix) VALUES (?, ?, ?, ?)").run(project.id, project.bbProjectId, project.name, prefix);
          projectIds.set(project.id, project.id);
        }
        let imported = 0;
        for (const goal of snapshot.goals) {
          const existing = get(goal.id);
          const sameKey = store.byKey(goal.key);
          if (!existing && sameKey) throw new Error(`Ключ цели ${goal.key} занят другой записью; импорт отменён`);
          imported += insertGoal.run({ id: goal.id, key: goal.key, bb_project_id: goal.bbProjectId, project_id: projectIds.get(goal.projectId) ?? goal.projectId,
            title: goal.title, status: goal.status, importance: goal.importance, origin: goal.origin, requested_by: goal.requestedBy,
            owner_thread_id: goal.ownerThreadId, summary: goal.summary, parent_task_id: goal.parentTaskId, priority: goal.priority,
            created_at: goal.createdAt, updated_at: goal.updatedAt, done_at: goal.doneAt }).changes;
          // Never change existing local fields on a retried import.
          if (get(goal.id)) for (const threadId of goal.threadIds) link(goal.id, threadId);
          const projectId = projectIds.get(goal.projectId) ?? goal.projectId;
          const project = projects().find((value) => value.id === projectId);
          if (project && goal.key.startsWith(`${project.prefix}-`)) {
            const number = Number(goal.key.slice(project.prefix.length + 1));
            if (Number.isInteger(number) && number >= 0) db.prepare("UPDATE goal_projects SET next_number = MAX(next_number, ?) WHERE id = ?").run(number + 1, projectId);
          }
        }
        return imported;
      })();
    },
  };
  return store;
}
export type GoalsStore = ReturnType<typeof createGoalsStore>;

export const LEGACY_IMPORT_KEY = "legacyGoalsImported:v1";
export type LegacyImportResult = {
  status: "imported" | "already-imported" | "unavailable";
  imported: number; total: number; statuses: Partial<Record<GoalStatus, number>>; error?: string;
};

/** All dependency reads live here. Operational goals never call the former plugin. */
export async function migrateLegacy(bb: BbPluginApi, store: GoalsStore): Promise<LegacyImportResult> {
  if (await bb.storage.kv.get(LEGACY_IMPORT_KEY)) return { status: "already-imported", imported: 0, total: 0, statuses: {} };
  try {
    const projectSchema = z.object({ id: z.string(), name: z.string(), prefix: z.string(), linkedBbProjectId: z.string().nullable().optional() });
    const taskSchema = z.object({
      id: z.string(), projectId: z.string(), key: z.string(), title: z.string(),
      status: z.enum(["backlog", "todo", ...STATUSES]), priority: z.string(),
      parentTaskId: z.string().nullable(), updatedAt: z.string(),
      createdAt: z.string().optional(), doneAt: z.string().nullable().optional(),
    });
    // Deliberately read-only. Omitting parentTaskId includes child records too.
    const call = <T>(method: string, input: unknown, outputSchema: z.ZodType<T>) => bb.sdk.plugins.callRpc({
      pluginId: ["ta", "sks"].join(""), method, input: input as never, outputSchema,
    });
    const [projectResult, taskResult, cardResult, rawMetadata, rawLinks] = await Promise.all([
      call("listProjects", {}, z.object({ projects: z.array(projectSchema) })),
      call("listAllTasks", {}, z.object({ tasks: z.array(taskSchema) })),
      call("listTaskCardMeta", {}, z.object({ cards: z.array(z.object({ taskId: z.string(), activeThreads: z.array(z.object({ threadId: z.string() })) })) })),
      bb.storage.kv.get<Record<string, unknown>>("goals"),
      bb.storage.kv.get<Record<string, unknown>>("threadLinks"),
    ]);
    const metadata = rawMetadata && !Array.isArray(rawMetadata) ? rawMetadata : {};
    const links = rawLinks && !Array.isArray(rawLinks) ? rawLinks : {};
    const dispatched = new Map(cardResult.cards.map((card) => [card.taskId, card.activeThreads.map((thread) => thread.threadId)]));
    const projectMap = new Map(projectResult.projects.map((project) => [project.id, project]));
    const allLinks = new Map(taskResult.tasks.map((task) => [task.id, [...new Set([
      ...(Array.isArray(links[task.id]) ? (links[task.id] as unknown[]).filter((id): id is string => typeof id === "string") : []),
      ...(dispatched.get(task.id) ?? []),
    ])]]));
    const missingOwners = [...new Set(taskResult.tasks.flatMap((task) => {
      const value = metadata[task.id];
      const meta = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
      const validOrigin = ["manual", "user-request", "agent-self", "user", "agent"].includes(String(meta.origin));
      return validOrigin && (typeof meta.ownerThreadId === "string" || meta.ownerThreadId === null) ? [] : allLinks.get(task.id)?.slice(0, 1) ?? [];
    }))];
    const roots = new Map<string, string>();
    for (let offset = 0; offset < missingOwners.length; offset += 200) {
      const result = await bb.sdk.threads.experimental_listAncestors({ threadIds: missingOwners.slice(offset, offset + 200) });
      for (const row of result.threads) roots.set(row.threadId, row.ancestorIds.at(-1) ?? row.threadId);
    }
    const statuses: Partial<Record<GoalStatus, number>> = {};
    const goals: DockTask[] = taskResult.tasks.map((task) => {
      const value = metadata[task.id];
      const meta = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
      const threadIds = allLinks.get(task.id) ?? [];
      const legacyOrigin = meta.origin === "user" ? "manual" : meta.origin === "agent" ? "user-request" : meta.origin;
      const origin: GoalOrigin = legacyOrigin === "manual" || legacyOrigin === "user-request" || legacyOrigin === "agent-self"
        ? legacyOrigin : threadIds.length ? "user-request" : "manual";
      const validOrigin = ["manual", "user-request", "agent-self"].includes(String(legacyOrigin));
      const ownerThreadId = validOrigin && typeof meta.ownerThreadId === "string" ? meta.ownerThreadId
        : meta.ownerThreadId === null && validOrigin ? null
        : threadIds[0] ? roots.get(threadIds[0]) ?? threadIds[0] : null;
      if (ownerThreadId && !threadIds.includes(ownerThreadId)) threadIds.push(ownerThreadId);
      const status: GoalStatus = task.status === "todo" || task.status === "backlog" ? "queue" : task.status;
      statuses[status] = (statuses[status] ?? 0) + 1;
      return {
        ...task, status, bbProjectId: projectMap.get(task.projectId)?.linkedBbProjectId ?? null,
        threadIds, origin, importance: importanceFromPriority(task.priority),
        requestedBy: meta.requestedBy === "self" || meta.requestedBy === "user" ? meta.requestedBy : origin === "agent-self" ? "self" : "user",
        ownerThreadId, summary: typeof meta.summary === "string" ? summarizeAgentAnswer(meta.summary) : null,
        createdAt: typeof meta.createdAt === "string" ? meta.createdAt : task.createdAt ?? task.updatedAt,
        doneAt: task.doneAt ?? (status === "done" ? task.updatedAt : null),
      };
    });
    const projects = projectResult.projects.map((project) => ({ id: project.id, name: project.name, prefix: project.prefix, bbProjectId: project.linkedBbProjectId ?? null }));
    // Preserve records whose old project is missing from the projects response.
    for (const goal of goals) if (!projects.some((project) => project.id === goal.projectId)) {
      projects.push({ id: goal.projectId, name: goal.projectId, prefix: derivePrefix(goal.projectId, new Set(projects.map((project) => project.prefix))), bbProjectId: null });
    }
    const imported = store.importSnapshot({ projects, goals });
    await bb.storage.kv.set(LEGACY_IMPORT_KEY, { importedAt: new Date().toISOString(), total: goals.length, statuses });
    bb.log.info(`Импорт целей: ${imported}/${goals.length}; статусы: ${JSON.stringify(statuses)}`);
    return { status: "imported", imported, total: goals.length, statuses };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    bb.log.warn(`Импорт прежних целей не завершён; локальная доска доступна: ${message}`);
    return { status: "unavailable", imported: 0, total: 0, statuses: {}, error: message };
  }
}
