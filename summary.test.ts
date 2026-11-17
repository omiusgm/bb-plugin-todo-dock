import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeAgentAnswer } from "./summary.ts";

test("first paragraph is plain text and whitespace is collapsed", () => {
  assert.equal(summarizeAgentAnswer("  # **Готово** [файл](https://example.com).\n> `Проверено` __дважды__.\n\n- Лишнее"), "Готово файл. Проверено дважды.");
  assert.equal(summarizeAgentAnswer("- Исправлен баг в client-server.\n  Работает."), "Исправлен баг в client-server. Работает.");
});
test("long text ends at a sentence or a word within 280 characters", () => {
  const text = `Первое предложение. ${"Длинное слово ".repeat(30)}`;
  assert.equal(summarizeAgentAnswer(text), "Первое предложение.…");
  const longWordText = "Слово ".repeat(80);
  const result = summarizeAgentAnswer(longWordText);
  assert.ok(result.length <= 280);
  assert.ok(result.endsWith("Слово…"));
  assert.equal(summarizeAgentAnswer(result), result);
});
