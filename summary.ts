/** First paragraph of an agent answer, in plain text for a goal card. */
export function summarizeAgentAnswer(answer: string): string {
  const paragraph = answer.trim().split(/\r?\n[\t ]*\r?\n/, 1)[0] ?? "";
  const text = paragraph
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[\t ]*(?:(?:#{1,6}|[-+*]|\d+[.)])[\t ]+|>[\t ]*)+/gm, "")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/\s+/g, " ").trim();
  if (text.length <= 280) return text;
  // Reserve one character for the ellipsis, and prefer a complete sentence.
  const prefix = text.slice(0, 279);
  const sentences = [...prefix.matchAll(/[.!?](?=\s|$)/g)];
  const end = sentences.at(-1)?.index;
  if (end !== undefined) return `${prefix.slice(0, end + 1).trimEnd()}…`;
  const space = prefix.lastIndexOf(" ");
  return `${(space > 0 ? prefix.slice(0, space) : prefix).trimEnd()}…`;
}
