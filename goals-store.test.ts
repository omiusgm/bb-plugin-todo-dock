import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createGoalsStore, LEGACY_IMPORT_KEY, migrateLegacy } from "./goals-store.ts";
import { goalsRpcMethods } from "./goals-contract.ts";

const at = "2026-11-10T12:00:00.000Z";
const project = { id: "legacy_project", name: "Example", prefix: "EX", linkedBbProjectId: "proj_example" };
function legacyGoal(index: number, overrides: Record<string, unknown> = {}) {
  return { id: `legacy_${index}`, key: `EX-${index}`, projectId: project.id, title: `Goal ${index}`,
    status: "todo", priority: "none", parentTaskId: null, updatedAt: at, ...overrides };
}
function setup(t: TestContext, initial = [legacyGoal(1)]) {
  const calls: { method: string; input: unknown }[] = [];
  let fail: string | undefined;
  let ancestorsFail = false;
  const data = { projects: [project], tasks: initial, cards: [] as { taskId: string; activeThreads: { threadId: string }[] }[] };
  const host = createFakePluginHost({ pluginId: "todo-dock", sdk: {
    plugins: { callRpc: async ({ pluginId, method, input, outputSchema }) => {
      assert.equal(pluginId, ["ta", "sks"].join(""));
      calls.push({ method, input });
      if (fail === method) throw new Error(`Unavailable: ${method}`);
      if (method === "listProjects") return outputSchema.parse({ projects: data.projects });
      if (method === "listAllTasks") {
        assert.deepEqual(input, {}, "migration must not request only root records");
        return outputSchema.parse({ tasks: data.tasks });
      }
      if (method === "listTaskCardMeta") return outputSchema.parse({ cards: data.cards });
      throw new Error(`Unexpected mutation or read: ${method}`);
    } },
    threads: { experimental_listAncestors: async ({ threadIds }) => {
      if (ancestorsFail) throw new Error("Ancestors unavailable");
      return { threads: threadIds.map((threadId) => ({ threadId, ancestorIds: threadId === "child" ? ["root"] : [] })) };
    } },
  } });
  t.after(() => host.harness.lifecycle.dispose());
  const store = createGoalsStore(host.bb);
  return { ...host, store, data, calls, fail(method?: string) { fail = method; }, failAncestors(value: boolean) { ancestorsFail = value; } };
}

test("imports every legacy status, child, key and priority without changing source KV", async (t) => {
  const statuses = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"];
  const priorities = ["urgent", "high", "none", "low", "medium", "none"];
  const state = setup(t, statuses.map((status, index) => legacyGoal(index + 1, { status, priority: priorities[index], parentTaskId: index === 1 ? "legacy_1" : null })));
  const metadata = {
    legacy_1: { origin: "user", ownerThreadId: null, createdAt: "2026-10-01T12:00:00.000Z", summary: "Owner summary" },
    legacy_2: { origin: "agent", ownerThreadId: "root", createdAt: at },
    legacy_3: { origin: "agent-self", requestedBy: "self", ownerThreadId: "other", createdAt: at },
    legacy_5: { origin: "unknown", ownerThreadId: "invalid-owner", createdAt: at },
  };
  const links = { legacy_4: ["child"], legacy_2: ["child"], legacy_1: ["child"], legacy_5: ["child"] };
  await state.bb.storage.kv.set("goals", metadata);
  await state.bb.storage.kv.set("threadLinks", links);
  state.data.cards = [{ taskId: "legacy_4", activeThreads: [{ threadId: "dispatch" }, { threadId: "child" }] }];
  const result = await migrateLegacy(state.bb, state.store);
  assert.equal(result.status, "imported");
  assert.equal(result.imported, 6);
  assert.deepEqual(result.statuses, { queue: 2, in_progress: 1, in_review: 1, done: 1, canceled: 1 });
  assert.equal(state.store.list().length, 6);
  assert.equal(state.store.get("legacy_2")?.parentTaskId, "legacy_1");
  assert.equal(state.store.get("legacy_1")?.origin, "manual");
  assert.equal(state.store.get("legacy_1")?.ownerThreadId, null);
  assert.equal(state.store.get("legacy_1")?.importance, "urgent");
  assert.equal(state.store.get("legacy_1")?.createdAt, metadata.legacy_1.createdAt);
  assert.equal(state.store.get("legacy_1")?.summary, "Owner summary");
  assert.equal(state.store.get("legacy_2")?.origin, "user-request");
  assert.equal(state.store.get("legacy_2")?.importance, "important");
  assert.equal(state.store.get("legacy_3")?.requestedBy, "self");
  assert.equal(state.store.get("legacy_4")?.importance, "later");
  assert.equal(state.store.get("legacy_4")?.ownerThreadId, "root");
  assert.deepEqual(state.store.get("legacy_4")?.threadIds, ["child", "dispatch", "root"]);
  assert.equal(state.store.byKey("ex-5")?.doneAt, at);
  assert.equal(state.store.get("legacy_5")?.ownerThreadId, "root");
  assert.equal(state.store.get("legacy_6")?.status, "canceled");
  assert.deepEqual(await state.bb.storage.kv.get("goals"), metadata);
  assert.deepEqual(await state.bb.storage.kv.get("threadLinks"), links);
  assert.equal(state.store.list({ includeClosed: false }).length, 4);
  assert.equal(state.store.list({ origin: "agent" }).length, 1);
});

test("successful migration is idempotent and reload never consults the legacy plugin", async (t) => {
  const state = setup(t);
  await migrateLegacy(state.bb, state.store);
  const calls = state.calls.length;
  state.store.update("legacy_1", { summary: "Local result" });
  assert.equal((await migrateLegacy(state.bb, state.store)).status, "already-imported");
  assert.equal(state.calls.length, calls);
  const next = await state.harness.lifecycle.reload(async (bb) => {
    const reloaded = createGoalsStore(bb);
    assert.equal((await migrateLegacy(bb, reloaded)).status, "already-imported");
    assert.equal(reloaded.get("legacy_1")?.summary, "Local result");
    assert.equal(reloaded.list().length, 1);
  });
  t.after(() => next.harness.lifecycle.dispose());
  assert.equal(state.calls.length, calls);
});

test("missing legacy plugin leaves a usable empty board and no completion flag", async (t) => {
  const state = setup(t);
  state.fail("listProjects");
  assert.equal((await migrateLegacy(state.bb, state.store)).status, "unavailable");
  assert.equal(await state.bb.storage.kv.get(LEGACY_IMPORT_KEY), undefined);
  assert.deepEqual(state.store.list(), []);
  state.store.ensureProject("proj_new", "Новый проект");
  const goal = state.store.create({ bbProjectId: "proj_new", title: "Working locally" });
  assert.equal(goal.status, "queue");
  assert.equal(state.store.get(goal.id)?.title, "Working locally");
});

test("a failed read does not import a partial snapshot; retry imports all data", async (t) => {
  const state = setup(t, [legacyGoal(1), legacyGoal(2)]);
  state.fail("listTaskCardMeta");
  assert.equal((await migrateLegacy(state.bb, state.store)).status, "unavailable");
  assert.equal(state.store.list().length, 0);
  assert.equal(state.store.projects().length, 0);
  assert.equal(await state.bb.storage.kv.get(LEGACY_IMPORT_KEY), undefined);
  state.fail();
  assert.equal((await migrateLegacy(state.bb, state.store)).imported, 2);
  assert.equal(state.store.list().length, 2);
});

test("failed ancestor lookup leaves the import retryable", async (t) => {
  const state = setup(t);
  await state.bb.storage.kv.set("threadLinks", { legacy_1: ["child"] });
  state.failAncestors(true);
  assert.equal((await migrateLegacy(state.bb, state.store)).status, "unavailable");
  assert.equal(state.store.list().length, 0);
  assert.equal(await state.bb.storage.kv.get(LEGACY_IMPORT_KEY), undefined);
  state.failAncestors(false);
  assert.equal((await migrateLegacy(state.bb, state.store)).imported, 1);
  assert.equal(state.store.get("legacy_1")?.ownerThreadId, "root");
});

test("key conflicts roll back the entire snapshot instead of silently dropping goals", async (t) => {
  const state = setup(t, [legacyGoal(1), legacyGoal(2)]);
  const localProject = state.store.ensureProject("proj_local", "Example");
  assert.equal(localProject.prefix, "EXAMP");
  // A valid earlier local goal with a conflicting key simulates a resumed import.
  state.bb.storage.database().prepare(`INSERT INTO goals (id,key,bb_project_id,project_id,title,status,importance,origin,requested_by,priority,created_at,updated_at)
    VALUES ('local','EX-2','proj_local',?,'Local','queue','normal','manual','user','none',?,?)`).run(localProject.id, at, at);
  const result = await migrateLegacy(state.bb, state.store);
  assert.equal(result.status, "unavailable");
  assert.match(result.error ?? "", /EX-2/);
  assert.equal(state.store.list().length, 1);
  assert.equal(state.store.get("legacy_1"), null);
  assert.equal(state.store.projects().length, 1);
  assert.equal(await state.bb.storage.kv.get(LEGACY_IMPORT_KEY), undefined);
  state.store.remove("local");
  assert.equal((await migrateLegacy(state.bb, state.store)).imported, 2);
});

test("KV flag write failure can retry without overwriting local edits", async (t) => {
  const state = setup(t);
  const set = state.bb.storage.kv.set.bind(state.bb.storage.kv);
  let failFlag = true;
  state.bb.storage.kv.set = async (key, value) => {
    if (key === LEGACY_IMPORT_KEY && failFlag) throw new Error("KV unavailable");
    return set(key, value);
  };
  assert.equal((await migrateLegacy(state.bb, state.store)).status, "unavailable");
  assert.equal(state.store.list().length, 1);
  state.store.update("legacy_1", { title: "Local title", summary: "Local summary" });
  failFlag = false;
  assert.equal((await migrateLegacy(state.bb, state.store)).imported, 0);
  assert.equal(state.store.get("legacy_1")?.title, "Local title");
  assert.equal(state.store.get("legacy_1")?.summary, "Local summary");
});

test("new keys continue imported numbering, project prefixes are unique and links are removed", async (t) => {
  const state = setup(t, [legacyGoal(2), legacyGoal(12)]);
  await migrateLegacy(state.bb, state.store);
  const goal = state.store.create({ bbProjectId: "proj_example", title: "Next", ownerThreadId: "root" });
  assert.equal(goal.key, "EX-13");
  assert.equal(state.store.ensureProject("proj_example", "Renamed").id, project.id);
  const first = state.store.ensureProject("proj_one", "Пример");
  const second = state.store.ensureProject("proj_two", "Пример");
  assert.match(first.prefix, /^[A-Z][A-Z0-9]{0,9}$/);
  assert.notEqual(first.prefix, second.prefix);
  state.store.link(goal.id, "root");
  state.store.link(goal.id, "child");
  assert.deepEqual(state.store.get(goal.id)?.threadIds, ["root", "child"]);
  assert.equal(state.store.setStatus(goal.id, "done").doneAt !== null, true);
  assert.equal(state.store.setStatus(goal.id, "in_progress").doneAt, null);
  assert.equal(state.store.remove(goal.id), true);
  assert.equal(state.store.remove(goal.id), false);
  assert.equal(state.store.create({ bbProjectId: "proj_example", title: "After removal" }).key, "EX-14");
  const count = state.bb.storage.database().prepare("SELECT COUNT(*) AS count FROM goal_thread_links WHERE goal_id = ?").get(goal.id) as { count: number };
  assert.equal(count.count, 0);
});

test("wire contract normalizes legacy queue input and exposes no importance mutation", () => {
  assert.equal(goalsRpcMethods.addTask.input.parse({ bbProjectId: "proj_a", title: "Queued", status: "todo" }).status, "queue");
  assert.equal(goalsRpcMethods.add.input.parse({ bbProjectId: "proj_a", title: "Queued", importance: "urgent" }).status, "queue");
  assert.equal(Object.hasOwn(goalsRpcMethods.add.input.parse({ bbProjectId: "proj_a", title: "Queued", importance: "urgent" }), "importance"), false);
  assert.deepEqual(goalsRpcMethods.overview.input.parse({ origin: "agent", statuses: ["queue"], includeClosed: false }), { origin: "agent", statuses: ["queue"], includeClosed: false });
});
