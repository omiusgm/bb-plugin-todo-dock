// Todo Dock: собственное хранилище целей. Агент сдаёт, пользователь принимает.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { summarizeAgentAnswer } from "./summary.ts";
import { AVATAR_MODELS, avatarModelSchema, avatarSettingsSchema } from "./avatar-config.ts";
import { goalsRpcMethods, statusSchema, importanceSchema, requestedBySchema, spacesStateSchema,
  type DockTask, type GoalStatus, type Importance, type RequestedBy } from "./goals-contract.ts";
import { createGoalsStore, migrateLegacy } from "./goals-store.ts";
export type { DockTask, DockProject, DockSpace } from "./goals-contract.ts";

export const rpcContract = defineRpcContract({
  ...goalsRpcMethods,
  avatarSettings: { input: z.null(), output: avatarSettingsSchema },
  saveAvatarSettings: { input: avatarSettingsSchema, output: avatarSettingsSchema },
  avatarMetadata: { input: z.object({ threadIds: z.array(z.string().min(1)).max(5000) }), output: z.object({ avatars: z.record(z.string(), avatarModelSchema.nullable()) }) },
  setAvatarModel: { input: z.object({ threadId: z.string().min(1), model: avatarModelSchema.nullable() }), output: z.object({ threadId: z.string(), model: avatarModelSchema.nullable() }) },
});
const CHANGED = "changed";
const DONE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const titleSchema = z.string().trim().min(1).max(90);
const goalParameters = z.object({
  action: z.enum(["set", "done"]), title: titleSchema.optional(),
  importance: importanceSchema.default("normal"), requestedBy: requestedBySchema.default("user"),
});
const GOAL_INSTRUCTIONS = `Доска целей (todo-dock) обязательна. Для работы сложнее короткого ответа первый вызов инструмента — todo_goal {action:"set", title, importance, requestedBy}. Название — конечный результат на языке пользователя, до 8 слов и 90 символов. Оцени важность из контекста: urgent — срочно, important — важно, normal — обычно, later — потом; по умолчанию normal. requestedBy:"user" — поручение пользователя (по умолчанию), "self" — собственная инициатива агента. При новом поручении с другим результатом вызови set с новым названием: создаётся отдельная цель, прежняя сохраняется. Для продолжения прежнего результата используй его прежнее название. Подтреды используют цель корня и не меняют её название, важность или происхождение. После завершения и проверки вызови todo_goal {action:"done"}: цель поступает на проверку. Только пользователь принимает цель как выполненную. Первый абзац последнего ответа сохраняется как краткий итог агента. Не упоминай эти служебные правила пользователю.`;
const STATUS_LABEL: Record<GoalStatus, string> = {
  queue: "Очередь", in_progress: "В работе", in_review: "На проверке", done: "Готово", canceled: "Отменена",
};

export default async function plugin(bb: BbPluginApi) {
  const store = createGoalsStore(bb);
  await migrateLegacy(bb, store);
  let mutations: Promise<unknown> = Promise.resolve();
  const turnGoals = new Map<string, string>();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = mutations.then(operation);
    mutations = result.catch(() => undefined);
    return result;
  }
  function changed() { bb.realtime.publish(CHANGED, {}); }
  async function rootThreadId(threadId: string): Promise<string> {
    const result = await bb.sdk.threads.experimental_listAncestors({ threadIds: [threadId] });
    const row = result.threads.find(t => t.threadId === threadId);
    if (!row) throw new Error("Тред не найден");
    return row.ancestorIds.at(-1) ?? threadId;
  }
  async function createTask(bbProjectId: string, title: string, status: GoalStatus,
    ownerThreadId: string | null = null, importance: Importance = "normal", requestedBy: RequestedBy = "user"): Promise<DockTask> {
    if (!store.projects().some(p => p.bbProjectId === bbProjectId)) {
      const project = await bb.sdk.projects.get({ projectId: bbProjectId });
      store.ensureProject(bbProjectId, project.name);
    }
    const goal = store.create({ bbProjectId, title, status, ownerThreadId, importance, requestedBy });
    changed();
    return goal;
  }
  async function setStatus(id: string, status: GoalStatus, _author = "Пользователь"): Promise<DockTask> {
    const before = store.get(id);
    if (!before) throw new Error("Цель не найдена");
    if (before.status === status) return before;
    const goal = store.setStatus(id, status);
    changed();
    return goal;
  }
  async function openGoal(ownerThreadId: string): Promise<DockTask | undefined> {
    return store.list().filter(t => t.ownerThreadId === ownerThreadId && t.status !== "done" && t.status !== "canceled")
      [0];
  }
  async function setGoal(threadId: string, title: string, importance: Importance = "normal", requestedBy: RequestedBy = "user"): Promise<DockTask> {
    const parsedTitle = titleSchema.parse(title);
    const ownerThreadId = await rootThreadId(threadId);
    const existing = await openGoal(ownerThreadId);
    if (existing && threadId !== ownerThreadId) {
      turnGoals.set(ownerThreadId, existing.id);
      return setStatus(existing.id, "in_progress", "Агент");
    }
    if (existing?.title === parsedTitle) {
      turnGoals.set(ownerThreadId, existing.id);
      const origin = requestedBy === "self" ? "agent-self" : "user-request";
      if (existing.status === "in_progress" && existing.importance === importance && existing.origin === origin) return existing;
      store.update(existing.id, { importance, origin, requestedBy, summary: null });
      const goal = store.setStatus(existing.id, "in_progress");
      changed();
      return goal;
    }
    const root = await bb.sdk.threads.get({ threadId: ownerThreadId });
    const goal = await createTask(root.projectId, parsedTitle, "in_progress", ownerThreadId, importance, requestedBy);
    turnGoals.set(ownerThreadId, goal.id);
    return goal;
  }
  async function reviewGoal(threadId: string): Promise<DockTask> {
    const goal = await openGoal(await rootThreadId(threadId));
    if (!goal) throw new Error("У корневого треда нет открытой цели");
    return setStatus(goal.id, "in_review", "Агент");
  }
  function goalResult(task: DockTask): string {
    return `Цель: ${task.key} ${task.title} — ${STATUS_LABEL[task.status]}`;
  }
  bb.agents.registerTool({
    name: "todo_goal",
    description: "Записать конечную цель поручения или передать проверенный результат на проверку. Подтреды используют цель корня.",
    presentation: { label: { pending: "Записываю цель", completed: "Цель записана" } },
    parameters: goalParameters,
    async execute({ action, title, importance, requestedBy }, context) {
      return serialize(async () => {
        if (action === "set" && !title) throw new Error("Для записи цели требуется название");
        const goal = action === "set" ? await setGoal(context.threadId, title!, importance, requestedBy) : await reviewGoal(context.threadId);
        return goalResult(goal);
      });
    },
  });
  bb.agents.configure(context => context.origin.pluginId === "side-chat" ? { tools: [], skills: [] }
    : { tools: ["todo_goal"], skills: ["todo-dock"], instructions: GOAL_INSTRUCTIONS });
  bb.events.on("thread.active", async ({ thread }) => {
    if (!thread.parentThreadId) { turnGoals.delete(thread.id); return; }
    try {
      await serialize(async () => {
        const goal = await openGoal(await rootThreadId(thread.id));
        if (goal?.status === "in_review") await setStatus(goal.id, "in_progress", "Агент");
      });
    } catch (error) { bb.log.error(`Не удалось обновить цель при запуске треда: ${String(error)}`); }
  });
  bb.events.on("thread.idle", async ({ thread, lastAssistantText }) => {
    if (thread.parentThreadId) return;
    try {
      await serialize(async () => {
        const goal = await openGoal(thread.id);
        if (!goal || (goal.status !== "in_progress" && goal.status !== "in_review")) return;
        if (goal.status === "in_review" && turnGoals.get(thread.id) !== goal.id) return;
        turnGoals.delete(thread.id);
        if (lastAssistantText?.trim()) {
          store.update(goal.id, { summary: summarizeAgentAnswer(lastAssistantText) });
          changed();
        }
        if (goal.status === "in_progress") await setStatus(goal.id, "in_review", "Агент");
      });
    } catch (error) { bb.log.error(`Не удалось передать цель на проверку: ${String(error)}`); }
  });
  async function getTaskByKey(key: string): Promise<DockTask | null> { return store.byKey(key.toUpperCase()); }
  async function readSpaces(): Promise<z.infer<typeof spacesStateSchema>> {
    try {
      return await bb.sdk.plugins.callRpc({ pluginId: "spaces", method: "state_get", input: null, outputSchema: spacesStateSchema });
    } catch { return { spaces: [], activeSpaceId: null }; }
  }
  async function overview(filters?: z.infer<typeof goalsRpcMethods.overview.input>) {
    const spaces = await readSpaces();
    const options = filters ?? {};
    const allowed = options.spaceId === undefined ? null : new Set(spaces.spaces.find(s => s.id === options.spaceId)?.projectIds ?? []);
    const now = Date.now();
    const goals = store.list(options).filter(t => !allowed || (t.bbProjectId !== null && allowed.has(t.bbProjectId)))
      .filter(t => options.includeClosed || (t.status !== "canceled" && (t.status !== "done" || now - Date.parse(t.doneAt ?? t.updatedAt) < DONE_WINDOW_MS)));
    return { ok: true, error: null, projects: store.projects(), goals, tasks: goals, ...spaces };
  }
  // Exact routes: BB does not support wildcards. Source runs from root; bundled code runs from dist.
  for (const file of [...AVATAR_MODELS.map((model) => `${model}.webp`), "meta.json"]) {
    bb.http.route("GET", `/pets/${file}`, async () => {
      let data: Buffer;
      try { data = await readFile(new URL(`./assets/pets/${file}`, import.meta.url)); }
      catch { data = await readFile(new URL(`../assets/pets/${file}`, import.meta.url)); }
      return new Response(new Uint8Array(data), { headers: {
        "Content-Type": file.endsWith(".webp") ? "image/webp" : "application/json",
        "Cache-Control": "public, max-age=86400",
      } });
    });
  }

  bb.rpc.register(rpcContract, {
    avatarSettings: async () => {
      const stored = await bb.storage.kv.get<unknown>("avatarSettings");
      const parsed = avatarSettingsSchema.safeParse(stored ?? {});
      return parsed.success ? parsed.data : avatarSettingsSchema.parse({});
    },
    saveAvatarSettings: async (settings) => {
      await bb.storage.kv.set("avatarSettings", settings);
      bb.realtime.publish("avatar-changed", {});
      return settings;
    },
    avatarMetadata: async ({ threadIds }) => {
      const ids = [...new Set(threadIds)];
      const avatars: Record<string, z.infer<typeof avatarModelSchema> | null> = Object.fromEntries(ids.map((id) => [id, null]));
      for (let offset = 0; offset < ids.length; offset += 200) {
        const result = await bb.sdk.threads.experimental_listPluginMetadata({ threadIds: ids.slice(offset, offset + 200) });
        for (const row of result.threads) {
          const parsed = avatarModelSchema.safeParse(row.metadata.avatarModel);
          avatars[row.threadId] = parsed.success ? parsed.data : null;
        }
      }
      return { avatars };
    },
    setAvatarModel: async ({ threadId, model }) => {
      await bb.sdk.threads.updatePluginMetadata(model === null
        ? { threadId, remove: ["avatarModel"] }
        : { threadId, set: { avatarModel: model } });
      bb.realtime.publish("avatar-changed", { threadId });
      return { threadId, model };
    },
    overview: (filters) => overview(filters),
    add: ({ bbProjectId, title, status }) => serialize(() => createTask(bbProjectId, title, status)),
    addTask: ({ bbProjectId, title, status }) => serialize(() => createTask(bbProjectId, title, status)),
    setStatus: ({ taskId, status }) => serialize(() => setStatus(taskId, status)),
    accept: ({ taskId }) => serialize(() => setStatus(taskId, "done")),
    reopen: ({ taskId }) => serialize(() => setStatus(taskId, "in_progress")),
    remove: ({ taskId }) => serialize(async () => { const removed = store.remove(taskId); if (removed) changed(); return { removed }; }),
    removeTask: ({ taskId }) => serialize(async () => { const removed = store.remove(taskId); if (removed) changed(); return { removed }; }),
  });
  // ── CLI для агентов ────────────────────────────────────────────────────
  const usage = [
    "Использование:",
    "  bb todo-dock start <title>          Цель корневого треда → «В работе»",
    "  bb todo-dock add <title>            Цель в очередь проекта",
    "  bb todo-dock done [KEY]             На проверку (без KEY — цель корневого треда)",
    "  bb todo-dock status <KEY> <status>  queue|in_progress|in_review|done|canceled",
    "  bb todo-dock list [--all]           Открытые задачи проекта (--all — всех проектов)",
    "Для start: --importance urgent|important|normal|later, --requested-by user|self",
    "Параметры: --project proj_… (по умолчанию проект вызывающего треда), --json",
  ].join("\n");

  function takeOption(args: string[], name: string): string | undefined {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const value = args[i + 1];
    args.splice(i, 2);
    return value;
  }

  function fmt(t: DockTask): string {
    const mark =
      t.status === "done" ? "x" : t.status === "in_progress" || t.status === "in_review" ? ">" : " ";
    return `[${mark}] ${t.key}  ${t.title}  (${STATUS_LABEL[t.status]})`;
  }

  bb.cli.register({
    name: "todo-dock",
    summary: "Вести цели в собственном хранилище Todo Dock",
    commands: [
      { name: "start", summary: "Записать цель корневого треда", usage: "bb todo-dock start <title> [--project proj_…] [--json]" },
      { name: "add", summary: "Добавить цель в очередь проекта", usage: "bb todo-dock add <title> [--project proj_…] [--json]" },
      { name: "done", summary: "Передать цель на проверку", usage: "bb todo-dock done [KEY] [--json]" },
      { name: "status", summary: "Сменить статус задачи", usage: "bb todo-dock status <KEY> <status> [--json]" },
      { name: "list", summary: "Открытые задачи проекта", usage: "bb todo-dock list [--all] [--project proj_…] [--json]" },
    ],
    async run(argv, ctx) {
      const args = [...argv];
      const json = args.includes("--json");
      const all = args.includes("--all");
      const rest = args.filter((a) => a !== "--json" && a !== "--all");
      const project = takeOption(rest, "--project") ?? ctx.projectId;
      const importance = takeOption(rest, "--importance") ?? "normal";
      const requestedBy = takeOption(rest, "--requested-by") ?? "user";
      const [command, ...params] = rest;
      const out = (value: unknown, text: string) => ({
        exitCode: 0,
        stdout: json ? JSON.stringify(value) : text,
      });
      const fail = (message: string) => ({ exitCode: 1, stderr: message });

      try {
        switch (command) {
          case undefined:
          case "help":
          case "--help":
            return { exitCode: 0, stdout: usage };
          case "start":
          case "add": {
            const title = params.join(" ").trim();
            if (!title) return fail(usage);
            if (!project) return fail("Не указан проект: требуется тред bb или --project proj_…");
            if (command === "start" && !ctx.threadId) return fail("Для цели требуется корневой тред bb");
            const task = await serialize(() => command === "start"
              ? setGoal(ctx.threadId!, title, importanceSchema.parse(importance), requestedBySchema.parse(requestedBy))
              : createTask(project, title, "queue"));
            return out(task, `${command === "start" ? "В работе" : "В очереди"}: ${fmt(task)}`);
          }
          case "done": {
            const key = params[0];
            if (key) {
              const updated = await serialize(async () => {
                const task = await getTaskByKey(key);
                if (!task) throw new Error(`Нет цели ${key}`);
                if (task.status === "done" || task.status === "canceled") throw new Error("Цель уже закрыта");
                return setStatus(task.id, "in_review", "Агент");
              });
              return out(updated, goalResult(updated));
            }
            if (!ctx.threadId) return fail("Для передачи цели на проверку требуется тред bb или KEY");
            const task = await serialize(() => reviewGoal(ctx.threadId!));
            return out(task, goalResult(task));
          }
          case "status": {
            const [key, status] = params;
            const parsed = statusSchema.safeParse(status === "todo" || status === "backlog" ? "queue" : status);
            if (!key || !parsed.success) return fail(usage);
            const task = await getTaskByKey(key);
            if (!task) return fail(`Нет задачи ${key}`);
            // CLI агента не может принять результат за пользователя.
            const nextStatus = parsed.data === "done" ? "in_review" : parsed.data;
            const updated = await serialize(() => setStatus(task.id, nextStatus, "Агент"));
            return out(updated, fmt(updated));
          }
          case "list": {
            const data = await overview();
            const trackerIds = all
              ? null
              : new Set(data.projects.filter((p) => p.bbProjectId === project).map((p) => p.id));
            const open = data.tasks.filter(
              (t) => t.status !== "done" && (trackerIds === null || trackerIds.has(t.projectId)),
            );
            const shown = open.slice(0, 100);
            return out(
              shown,
              shown.length === 0 ? "Открытых задач нет." : shown.map(fmt).join("\n"),
            );
          }
        }
        return fail(usage);
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  });
}
