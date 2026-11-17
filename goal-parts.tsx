// Общие части целей: карточка страницы, строка дока, секция, фильтры, добавление.
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { experimental_ProviderIcon as ProviderIcon, experimental_useProviders as useProviders } from "@get-bb/plugin-sdk/app";
import type { DockProject, DockTask } from "./goals-contract";
import { Icon } from "@/components/ui/icon";

export type Kind = "need" | "work" | "err" | "rev" | "queue" | "done";
export type Provider = ReturnType<typeof useProviders>["providers"][number];
export type Origin = "all" | "user" | "agent";

const GLYPH: Record<Kind, string> = { need: "?", work: "●", err: "✗", rev: "✓", queue: "·", done: "✓" };
const LABEL: Record<Kind, string> = {
  need: "ждёт ответа", work: "работает", err: "ошибка", rev: "готово", queue: "в очереди", done: "принято",
};

export function kindOf(task: DockTask, waiting: boolean, ownerFailed: boolean): Kind {
  if (task.status === "done" || task.status === "canceled") return "done";
  if (waiting) return "need";
  if (ownerFailed) return "err";
  if (task.status === "in_review") return "rev";
  if (task.status === "in_progress") return "work";
  return "queue";
}

export function agentCount(count: number) {
  const last = count % 10;
  const lastTwo = count % 100;
  const word = lastTwo >= 11 && lastTwo <= 14 ? "агентов" : last === 1 ? "агент" : last >= 2 && last <= 4 ? "агента" : "агентов";
  return `${count} ${word}`;
}

function span(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (!Number.isFinite(min)) return "";
  if (min < 60) return `${min}м`;
  if (min < 1440) return `${Math.floor(min / 60)}ч`;
  return `${Math.floor(min / 1440)}д`;
}

export type GoalItem = {
  task: DockTask; kind: Kind; projectName: string; provider: Provider | undefined; agents: number;
};

export function GoalCard({ item, onOpen, onAccept, onReopen }: {
  item: GoalItem; onOpen: () => void; onAccept: () => void; onReopen: () => void;
}) {
  const { task, kind } = item;
  const linked = Boolean(task.ownerThreadId);
  const time = span(task.updatedAt);
  const stamp = kind === "work" || kind === "need" ? time : time && `${time} назад`;
  return <article className="td-card" data-k={kind} data-link={linked || undefined}
    role={linked ? "link" : undefined} tabIndex={linked ? 0 : undefined} onClick={linked ? onOpen : undefined}
    onKeyDown={(event) => { if (linked && event.target === event.currentTarget && event.key === "Enter") onOpen(); }}>
    <div className="top">
      <span className="ttl" style={task.status === "done" ? { color: "var(--muted-foreground)" } : undefined}>{task.title}</span>
      {task.importance === "urgent" ? <span className="td-chip" data-k="urgent">Срочно</span> : null}
      {task.importance === "important" ? <span className="td-chip" data-k="important">Важно</span> : null}
    </div>
    <div className="meta">
      {item.provider ? <ProviderIcon providerKind="agent" provider={item.provider} fallback="Bot" className="size-3.5" /> : null}
      <span>{item.projectName}</span>
      <span><span className="td-g">{GLYPH[kind]}</span> {LABEL[kind]}</span>
      {item.agents > 0 ? <span>{agentCount(item.agents)}</span> : null}
      {stamp ? <span>{stamp}</span> : null}
    </div>
    {kind === "rev" && task.summary ? <div className="sum">Итог агента · {task.summary}</div> : null}
    {kind === "rev" ? <div className="td-acts">
      <button type="button" className="td-btn pri" onClick={(event) => { event.stopPropagation(); onAccept(); }}><Icon name="Check" />Принять</button>
      <button type="button" className="td-btn" onClick={(event) => { event.stopPropagation(); onReopen(); }}><Icon name="ArrowTurnBackward" />Вернуть</button>
    </div> : null}
  </article>;
}

export function GoalRow({ item, onOpen, onAccept }: { item: GoalItem; onOpen: () => void; onAccept: () => void }) {
  const { kind } = item;
  const review = kind === "rev";
  return <div className="td-row" data-k={kind} role="link" tabIndex={0} title={item.task.title}
    onClick={onOpen} onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === "Enter") onOpen(); }}>
    <span className="t">{item.task.title}</span>
    {review ? <button type="button" className="ok" title="Принять" aria-label="Принять"
      onClick={(event) => { event.stopPropagation(); onAccept(); }}><Icon name="Check" /></button> : null}
    <span className={review ? "g has-ok" : "g"} aria-hidden>{GLYPH[kind]}</span>
  </div>;
}

export function Section({ title, count, children, defaultOpen = true }: {
  title: string; count: number; children: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className="td-section">
    <button type="button" className="td-head" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>{title}</span><span className="n">{count}</span>
    </button>
    {open ? children : null}
  </section>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="td-empty">{children}</div>;
}

export function OriginTabs({ value, onChange }: { value: Origin; onChange: (value: Origin) => void }) {
  return <div className="td-seg" role="group" aria-label="Происхождение целей">
    {([["all", "Все"], ["user", "Мои"], ["agent", "Агентов"]] as const).map(([key, label]) =>
      <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{label}</button>)}
  </div>;
}

export function AddGoal({ projects, projectId, onProject, onAdd }: {
  projects: ReadonlyArray<Pick<DockProject, "id" | "name">>; projectId: string;
  onProject: (id: string) => void; onAdd: (title: string, status: "todo" | "in_progress") => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const blocked = pending || title.trim() === "" || !projectId;
  const submit = async (status: "todo" | "in_progress") => {
    if (blocked) return;
    setPending(true);
    try { if (await onAdd(title.trim(), status)) setTitle(""); } finally { setPending(false); }
  };
  return <form className="td-add" onSubmit={(event: FormEvent) => { event.preventDefault(); void submit("todo"); }}>
    <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Новая цель…" aria-label="Новая цель" />
    <select className="td-select" value={projectId} onChange={(event) => onProject(event.target.value)} aria-label="Проект для новой цели">
      {projects.length === 0 ? <option value="">Нет проектов</option> : null}
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    <button type="submit" className="td-btn" disabled={blocked} title="В очередь" aria-label="В очередь"><Icon name="Plus" /></button>
    <button type="button" className="td-btn play" disabled={blocked} title="Сразу в работу" aria-label="Сразу в работу" onClick={() => void submit("in_progress")}><Icon name="Play" /></button>
  </form>;
}
