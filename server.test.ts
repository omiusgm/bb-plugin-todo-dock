import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createFakePluginHost, makePluginAgentConfigurationContext, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.ts";
import type { DockTask } from "./goals-contract.ts";

async function setup(t: TestContext) {
  const parents: Record<string, string[]> = { root: [], child: ["root"], grandchild: ["child", "root"], other: [] };
  const { bb, harness } = createFakePluginHost({
    pluginId: "todo-dock", agentSkillIds: ["todo-dock"],
    sdk: {
      projects: { get: async () => ({ id: "proj_root", name: "Example" }) as never },
      threads: {
        experimental_listAncestors: async ({ threadIds }) => ({ threads: threadIds.filter(id => Object.hasOwn(parents, id)).map(threadId => ({ threadId, ancestorIds: parents[threadId] })) }),
        get: async ({ threadId }) => makeThreadResponse({ id: threadId, projectId: "proj_root" }),
      },
      plugins: { callRpc: async ({ pluginId, outputSchema }) => {
        if (pluginId === "spaces") return outputSchema.parse({ spaces: [{ id: "personal", name: "Личное", icon: "Home", projectIds: ["proj_root"] }], activeSpaceId: "personal" });
        throw new Error("Legacy source unavailable");
      } },
    },
  });
  t.after(() => harness.lifecycle.dispose());
  await plugin(bb);
  async function overview(filters: unknown = null) { return await harness.behavior.callRpc("overview", filters) as { ok: boolean; tasks: DockTask[] }; }
  const set = (threadId = "root", title = "Deliver a checked result", importance = "normal", requestedBy = "user") =>
    harness.behavior.callAgentTool("todo_goal", { action: "set", title, importance, requestedBy }, { threadId });
  const done = (threadId = "root") => harness.behavior.callAgentTool("todo_goal", { action: "done" }, { threadId });
  const emit = (event: "thread.active" | "thread.idle", threadId = "root", lastAssistantText: string | null = null) => harness.behavior.emitThreadEvent(event, {
    thread: makeThreadResponse({ id: threadId, parentThreadId: parents[threadId]?.[0] ?? null }), lastAssistantText,
  });
  return { bb, harness, set, done, overview, emit };
}

test("goal policy is present for each origin except side-chat", async t => {
  const s = await setup(t);
  for (const pluginId of [null, "another-plugin"]) {
    const config = await s.harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ origin: { pluginId } }));
    assert.deepEqual(config.tools.map(tool => tool.name), ["todo_goal"]);
    assert.deepEqual(config.skills, ["todo-dock"]);
    assert.match(config.instructions!, /первый вызов инструмента — todo_goal/);
  }
  const config = await s.harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ origin: { pluginId: "side-chat" } }));
  assert.deepEqual(config.tools, []);
  assert.equal(config.instructions, null);
});

test("grandchildren use the root and its project; concurrent calls create one goal", async t => {
  const s = await setup(t);
  await Promise.all(Array.from({ length: 12 }, (_, i) => s.set(i % 2 ? "grandchild" : "root")));
  const [goal] = (await s.overview()).tasks;
  assert.equal((await s.overview()).tasks.length, 1);
  assert.equal(goal.ownerThreadId, "root");
  assert.equal(goal.bbProjectId, "proj_root");
  assert.equal(goal.key, "EXAMP-1");
  assert.equal(goal.origin, "user-request");
  assert.deepEqual(goal.threadIds, ["root"]);
  assert.equal(s.harness.realtimeSignals.length, 1);
});

test("new result creates another goal and preserves old title, importance and summary", async t => {
  const s = await setup(t);
  await s.set("root", "First result", "urgent");
  await s.done();
  await s.emit("thread.idle", "root", "**Проверено.**\nФайл готов.\n\nПодробности");
  await s.emit("thread.active");
  await s.set("root", "Second result");
  await s.emit("thread.idle", "root", "Второй файл готов.");
  const goals = (await s.overview()).tasks;
  assert.equal(goals.length, 2);
  const first = goals.find(g => g.title === "First result")!;
  assert.equal(first.status, "in_review");
  assert.equal(first.importance, "urgent");
  assert.equal(first.summary, "Проверено. Файл готов.");
  assert.equal(goals.find(g => g.title === "Second result")!.summary, "Второй файл готов.");
});

test("child cannot rename the root or change its importance and origin", async t => {
  const s = await setup(t);
  await s.set("root", "Root result", "urgent");
  await s.set("child", "Child step", "later", "self");
  const [goal] = (await s.overview()).tasks;
  assert.equal(goal.title, "Root result");
  assert.equal(goal.importance, "urgent");
  assert.equal(goal.origin, "user-request");
  assert.equal(goal.requestedBy, "user");
  assert.equal((await s.overview()).tasks.length, 1);
});

test("same title updates agent importance without duplicates, persists through reload", async t => {
  const s = await setup(t);
  await s.set();
  await s.set("root", "Deliver a checked result", "important", "self");
  const reload = await s.harness.lifecycle.reload(plugin);
  t.after(() => reload.harness.lifecycle.dispose());
  const data = await reload.harness.behavior.callRpc("overview", null) as { tasks: DockTask[] };
  assert.equal(data.tasks.length, 1);
  assert.equal(data.tasks[0].importance, "important");
  assert.equal(data.tasks[0].origin, "agent-self");
  assert.equal(data.tasks[0].requestedBy, "self");
});

test("done submits review; accept records doneAt; reopen clears doneAt", async t => {
  const s = await setup(t);
  await s.set();
  await s.done("child");
  const [goal] = (await s.overview()).tasks;
  assert.equal(goal.status, "in_review");
  const signals = s.harness.realtimeSignals.length;
  await s.done();
  assert.equal(s.harness.realtimeSignals.length, signals);
  const accepted = await s.harness.behavior.callRpc("accept", { taskId: goal.id }) as DockTask;
  assert.equal(accepted.status, "done");
  assert.ok(accepted.doneAt);
  await s.emit("thread.active", "child");
  await s.emit("thread.idle", "root", "Другой ответ.");
  assert.equal((await s.overview()).tasks[0].status, "done");
  const reopened = await s.harness.behavior.callRpc("reopen", { taskId: goal.id }) as DockTask;
  assert.equal(reopened.status, "in_progress");
  assert.equal(reopened.doneAt, null);
});

test("only root idle submits review; descendant activity resumes reviewed goal", async t => {
  const s = await setup(t);
  await s.set();
  await s.emit("thread.idle", "child", "Не итог");
  assert.equal((await s.overview()).tasks[0].status, "in_progress");
  await s.emit("thread.idle", "root", "Итог.");
  assert.equal((await s.overview()).tasks[0].status, "in_review");
  await s.emit("thread.active");
  assert.equal((await s.overview()).tasks[0].status, "in_review");
  await s.emit("thread.active", "child");
  assert.equal((await s.overview()).tasks[0].status, "in_progress");
});

test("a quick answer without set does not replace a submitted summary", async t => {
  const s = await setup(t);
  await s.set();
  await s.emit("thread.idle", "root", "Проверенный результат.");
  await s.emit("thread.active");
  await s.emit("thread.idle", "root", "Ответ на короткий вопрос.");
  const [goal] = (await s.overview()).tasks;
  assert.equal(goal.summary, "Проверенный результат.");
  assert.equal(goal.status, "in_review");
});

test("event failure is logged and mutation queue recovers", async t => {
  const s = await setup(t);
  await s.set();
  s.harness.inspection.sdk.stub("threads.experimental_listAncestors", async () => { throw new Error("lookup failed"); });
  const event = await s.emit("thread.active", "child");
  assert.deepEqual(event.errors, []);
  assert.ok(s.harness.logEntries.some(entry => entry.level === "error"));
  s.harness.inspection.sdk.stub("threads.experimental_listAncestors", async () => ({ threads: [{ threadId: "root", ancestorIds: [] }] }));
  await s.done();
  assert.equal((await s.overview()).tasks[0].status, "in_review");
});

test("invalid input and unknown root fail before a write; queue recovers", async t => {
  const s = await setup(t);
  await assert.rejects(s.set("missing"), /Тред не найден/);
  await assert.rejects(s.set("root", " "));
  await assert.rejects(s.set("root", "a".repeat(91)));
  await assert.rejects(s.harness.behavior.callAgentTool("todo_goal", { action: "set" }, { threadId: "root" }), /требуется название/);
  await assert.rejects(s.done(), /нет открытой цели/);
  assert.equal((await s.overview()).tasks.length, 0);
  await s.set();
  assert.equal((await s.overview()).tasks.length, 1);
});

test("manual add aliases, filters, statuses and removal work without legacy service", async t => {
  const s = await setup(t);
  const goal = await s.harness.behavior.callRpc("addTask", { bbProjectId: "proj_root", title: "Read report", status: "todo" }) as DockTask;
  assert.equal(goal.status, "queue");
  assert.equal(goal.origin, "manual");
  assert.equal(goal.ownerThreadId, null);
  assert.deepEqual(goal.threadIds, []);
  await s.set("root", "Own initiative", "later", "self");
  assert.equal((await s.overview({ origin: "user" })).tasks.length, 1);
  assert.equal((await s.overview({ origin: "agent" })).tasks.length, 1);
  assert.equal((await s.overview({ bbProjectId: "proj_missing" })).tasks.length, 0);
  assert.equal((await s.overview({ spaceId: "personal", statuses: ["queue"] })).tasks.length, 1);
  assert.equal((await s.overview({ spaceId: "missing" })).tasks.length, 0);
  await s.harness.behavior.callRpc("setStatus", { taskId: goal.id, status: "canceled" });
  assert.equal((await s.overview()).tasks.length, 1);
  assert.equal((await s.overview({ includeClosed: true })).tasks.length, 2);
  assert.deepEqual(await s.harness.behavior.callRpc("remove", { taskId: goal.id }), { removed: true });
  assert.deepEqual(await s.harness.behavior.callRpc("removeTask", { taskId: goal.id }), { removed: false });
  await assert.rejects(s.harness.behavior.callRpc("setStatus", { taskId: goal.id, status: "queue" }), /Цель не найдена/);
  await assert.rejects(s.harness.behavior.callRpc("setStatus", { taskId: "missing", status: "garbage" }));
});

test("CLI uses keys, root project and review semantics; supports queue aliases", async t => {
  const s = await setup(t);
  const ctx = { threadId: "child", projectId: "proj_child" };
  const start = await s.harness.behavior.runCli(["start", "Result", "--importance", "urgent", "--json"], ctx);
  assert.equal(start.exitCode, 0, start.stderr);
  const goal = JSON.parse(start.stdout) as DockTask;
  assert.equal(goal.ownerThreadId, "root");
  assert.equal(goal.bbProjectId, "proj_root");
  assert.equal(goal.importance, "urgent");
  for (const args of [["done"], ["status", goal.key.toLowerCase(), "done"], ["done", goal.key]]) {
    const result = await s.harness.behavior.runCli([...args, "--json"], ctx);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "in_review");
  }
  const queued = await s.harness.behavior.runCli(["status", goal.key, "queue", "--json"], ctx);
  assert.equal(JSON.parse(queued.stdout).status, "queue");
  const legacyAlias = await s.harness.behavior.runCli(["status", goal.key, "backlog", "--json"], ctx);
  assert.equal(JSON.parse(legacyAlias.stdout).status, "queue");
  await s.harness.behavior.callRpc("accept", { taskId: goal.id });
  assert.equal((await s.harness.behavior.runCli(["done", goal.key])).exitCode, 1);
  assert.equal((await s.harness.behavior.runCli(["start", "Result", "--project", "proj_root"])).exitCode, 1);
  assert.equal((await s.harness.behavior.runCli(["done"])).exitCode, 1);
  const added = await s.harness.behavior.runCli(["add", "Read report", "--project", "proj_root", "--json"]);
  assert.equal(added.exitCode, 0, added.stderr);
  const list = await s.harness.behavior.runCli(["list", "--all", "--json"]);
  assert.equal(JSON.parse(list.stdout).length, 1);
});

test("parallel agent submission cannot overwrite user acceptance", async t => {
  const s = await setup(t);
  await s.set();
  const [goal] = (await s.overview()).tasks;
  await Promise.all([
    s.harness.behavior.runCli(["done", goal.key]),
    s.harness.behavior.callRpc("accept", { taskId: goal.id }),
  ]);
  assert.equal((await s.overview()).tasks[0].status, "done");
});
