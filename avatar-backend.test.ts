import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.ts";
import { DEFAULT_AVATAR_SETTINGS } from "./avatar-config.ts";

test("avatar settings, metadata patch and image routes", async (t) => {
  const records = new Map<string, Record<string, any>>([["one", { unrelated: "kept" }]]);
  const batches: number[] = [];
  const { bb, harness } = createFakePluginHost({ pluginId: "todo-dock", sdk: { threads: {
    experimental_listPluginMetadata: async ({ threadIds }) => {
      batches.push(threadIds.length);
      return { threads: threadIds.filter(id => records.has(id)).map(threadId => ({ threadId, metadata: records.get(threadId)! })) };
    },
    updatePluginMetadata: async ({ threadId, set, remove }) => {
      const metadata = { ...records.get(threadId), ...set };
      for (const key of remove ?? []) delete metadata[key];
      records.set(threadId, metadata);
      return metadata;
    },
  } } });
  t.after(() => harness.lifecycle.dispose());
  await plugin(bb);
  assert.deepEqual(await harness.behavior.callRpc("avatarSettings", null), DEFAULT_AVATAR_SETTINGS);
  const settings = { ...DEFAULT_AVATAR_SETTINGS, size: 48, hybridAnimation: "static" };
  assert.deepEqual(await harness.behavior.callRpc("saveAvatarSettings", settings), settings);
  assert.deepEqual(await harness.behavior.callRpc("avatarSettings", null), settings);
  await assert.rejects(() => harness.behavior.callRpc("saveAvatarSettings", { ...settings, size: 99 }));
  await harness.behavior.callRpc("setAvatarModel", { threadId: "one", model: "crab" });
  assert.deepEqual(records.get("one"), { unrelated: "kept", avatarModel: "crab" });
  const ids = ["one", ...Array.from({ length: 200 }, (_, i) => `id${i}`)];
  const response = await harness.behavior.callRpc("avatarMetadata", { threadIds: ids }) as { avatars: Record<string, string | null> };
  assert.equal(response.avatars.one, "crab");
  assert.equal(response.avatars.id0, null);
  assert.deepEqual(batches, [200, 1]);
  await harness.behavior.callRpc("setAvatarModel", { threadId: "one", model: null });
  assert.deepEqual(records.get("one"), { unrelated: "kept" });
  assert.equal(harness.realtimeSignals.filter(signal => signal.channel === "avatar-changed").length, 3);
  const route = harness.registrations.httpRoutes.find(route => route.path === "/pets/codex.webp");
  assert.ok(route);
  const image = await route.handler({} as never, async () => {});
  assert.ok(image instanceof Response);
  assert.equal(image.headers.get("content-type"), "image/webp");
  assert.ok((await image.arrayBuffer()).byteLength > 0);
});
