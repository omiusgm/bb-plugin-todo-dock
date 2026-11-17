// Цели: страница и док собираются из одних и тех же частей (goal-parts.tsx).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  experimental_ThreadStatusGlyph as ThreadStatusGlyph,
  experimental_useSidebarThreads as useSidebarThreads,
  experimental_useProviders as useProviders,
  experimental_usePluginId as usePluginId,
  useBbContext,
  useBbNavigate,
  useRealtime,
  useRpc,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import type { DockProject, DockSpace, DockTask, goalsContract } from "./goals-contract";
import { GOALS_CSS } from "./goals-theme";
import { AddGoal, Empty, GoalCard, GoalRow, OriginTabs, Section, kindOf, type GoalItem, type Origin } from "./goal-parts";

const POLL_MS = 8000;
const BUSY = new Set(["starting", "active", "stopping"]);

export function useOverview() {
  const rpc = useRpc<typeof goalsContract>();
  const [projects, setProjects] = useState<DockProject[]>([]);
  const [tasks, setTasks] = useState<DockTask[] | null>(null);
  const [spaces, setSpaces] = useState<DockSpace[] | null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const report = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause));
  }, []);
  const refetch = useCallback(() => {
    rpc.call("overview").then((res) => {
      setSpaces(res.spaces);
      setActiveSpaceId(res.activeSpaceId);
      setProjects(res.projects);
      setTasks(res.tasks);
      setError(res.error);
    }, report);
  }, [rpc, report]);
  useEffect(() => {
    refetch();
    // Опрос восстанавливает данные после переподключения клиента.
    const timer = setInterval(refetch, POLL_MS);
    return () => clearInterval(timer);
  }, [refetch]);
  useRealtime("changed", refetch);
  return { rpc, projects, tasks, spaces, activeSpaceId, error, report, refetch };
}

function descendantThreads(ownerId: string | null, threads: readonly PluginSidebarThread[], byId: Map<string, PluginSidebarThread>) {
  if (!ownerId) return [];
  return threads.filter((thread) => {
    let parent = thread.parentThreadId;
    const visited = new Set<string>();
    while (parent && !visited.has(parent)) {
      if (parent === ownerId) return true;
      visited.add(parent);
      parent = byId.get(parent)?.parentThreadId ?? null;
    }
    return false;
  });
}

function AgentRow({ thread, projectName }: { thread: PluginSidebarThread; projectName: string }) {
  const navigate = useBbNavigate();
  return <button type="button" className="td-row" onClick={() => navigate.toThread(thread.id)} title={thread.indicatorLabel ?? thread.displayTitle}>
    <ThreadStatusGlyph indicator={thread.indicator} size="compact" />
    <span className="t">{thread.displayTitle}</span>
    <span className="m">{thread.hasPendingInteraction ? "нужен ответ" : projectName}</span>
  </button>;
}

const RANK = { urgent: 0, important: 1, normal: 2, later: 3 };
const byImportance = (a: DockTask, b: DockTask) =>
  (RANK[a.importance] ?? 2) - (RANK[b.importance] ?? 2) || b.updatedAt.localeCompare(a.updatedAt);

export function GoalsView({ compact = false, dismiss }: { compact?: boolean; dismiss?: () => void }) {
  const { rpc, projects, tasks, spaces, activeSpaceId, error, report, refetch } = useOverview();
  const navigate = useBbNavigate();
  const pluginId = usePluginId();
  const sidebar = useSidebarThreads();
  const { providers } = useProviders();
  const ctx = useBbContext();
  const [spaceChoice, setSpaceChoice] = useState(() => {
    try {
      const stored = localStorage.getItem(`${pluginId}:space`);
      return stored === "all" || stored?.startsWith("space:") ? stored : "sidebar";
    } catch { return "sidebar"; }
  });
  const [projectSelection, setProjectSelection] = useState({ scope: "", value: "all" });
  const [addSelection, setAddSelection] = useState({ scope: "", value: "" });
  const [origin, setOrigin] = useState<Origin>("all");
  // До ответа сервера сохранённое значение не проверяем и не перезаписываем.
  const validChoice = spaceChoice === "sidebar" || spaceChoice === "all" ||
    (spaceChoice.startsWith("space:") && spaces?.some((s) => s.id === spaceChoice.slice(6)));
  const choice = spaces === null || !validChoice ? "sidebar" : spaceChoice;
  useEffect(() => {
    // Временный сбой Spaces не стирает сохранённый выбор.
    try { localStorage.setItem(`${pluginId}:space`, spaceChoice); } catch { /* Хранилище недоступно. */ }
  }, [pluginId, spaceChoice]);

  const effectiveSpaceId = choice === "sidebar" ? activeSpaceId : choice === "all" ? null : choice.slice(6);
  const effectiveSpace = spaces?.find((s) => s.id === effectiveSpaceId);
  const explicitAll = choice === "all";
  const allScope = effectiveSpaceId === null && (explicitAll || choice === "sidebar");
  const scope = `${choice}:${effectiveSpaceId ?? "all"}`;
  useEffect(() => { setProjectSelection({ scope, value: "all" }); }, [scope]);
  const bbProjects = sidebar.projects;
  const spaceProjects = bbProjects.filter((p) =>
    spaces !== null && (explicitAll || p.id !== "proj_personal") &&
    (allScope || (effectiveSpace?.projectIds.includes(p.id) ?? false)),
  );
  const allowedIds = new Set(spaceProjects.map((p) => p.id));
  const filter = projectSelection.scope === scope &&
    (projectSelection.value === "all" || allowedIds.has(projectSelection.value))
    ? projectSelection.value : "all";
  const selectedAddProject = addSelection.scope === scope && allowedIds.has(addSelection.value)
    ? addSelection.value
    : (ctx.projectId && allowedIds.has(ctx.projectId) ? ctx.projectId : spaceProjects[0]?.id ?? "");

  const projectNames = useMemo(() => new Map(bbProjects.map((p) => [p.id, p.name])), [bbProjects]);
  const threadsById = useMemo(() => new Map(sidebar.threads.map((t) => [t.id, t])), [sidebar.threads]);
  // Проект хранилища → проект bb (для группировки и фильтра).
  const trackerToBb = useMemo(
    () => new Map(projects.map((p) => [p.id, p.bbProjectId ?? `tracker:${p.id}`])),
    [projects],
  );
  const groupName = useCallback(
    (key: string) =>
      key.startsWith("tracker:")
        ? (projects.find((p) => `tracker:${p.id}` === key)?.name ?? "Без проекта")
        : (projectNames.get(key) ?? key),
    [projects, projectNames],
  );

  const scopedTasks = (tasks ?? []).filter((t) => {
    const id = trackerToBb.get(t.projectId);
    const unlinked = !id || id.startsWith("tracker:");
    return (unlinked ? allScope : allowedIds.has(id)) && (filter === "all" || id === filter);
  });
  const visibleTasks = scopedTasks.filter((t) => origin === "all" || (origin === "user" ? t.origin === "manual" || t.origin === "user-request" : t.origin === "agent-self"));
  const children = (task: Pick<DockTask, "ownerThreadId">) => descendantThreads(task.ownerThreadId, sidebar.threads, threadsById);
  const waiting = (task: Pick<DockTask, "ownerThreadId" | "status">) => task.status !== "done" && task.status !== "canceled" &&
    (Boolean(task.ownerThreadId && threadsById.get(task.ownerThreadId)?.hasPendingInteraction) || children(task).some((t) => t.hasPendingInteraction));
  const items: GoalItem[] = visibleTasks.map((task) => {
    const owner = task.ownerThreadId ? threadsById.get(task.ownerThreadId) : undefined;
    return {
      task, kind: kindOf(task, waiting(task), owner?.status === "error"),
      projectName: groupName(trackerToBb.get(task.projectId) ?? `tracker:${task.projectId}`),
      provider: providers.find((p) => p.id === owner?.providerId),
      agents: children(task).filter((t) => !t.isArchived && BUSY.has(t.status)).length,
    };
  });
  const pick = (...kinds: string[]) => items.filter((i) => kinds.includes(i.kind)).sort((a, b) => byImportance(a.task, b.task));
  const needsAnswer = pick("need");
  const inWork = pick("work", "err");
  const review = pick("rev");
  const queued = pick("queue");
  const done = pick("done");
  const owners = new Set((tasks ?? []).map((t) => t.ownerThreadId).filter(Boolean));
  const unlinkedThreads = sidebar.threads.filter((t) => !t.parentThreadId && !t.isArchived && !t.isHidden &&
    (BUSY.has(t.status) || t.hasPendingInteraction) && allowedIds.has(t.projectId) &&
    (filter === "all" || t.projectId === filter) && !owners.has(t.id));
  const mutate = (promise: Promise<unknown>) => { promise.then(refetch, report); };
  const open = (item: GoalItem) => { if (item.task.ownerThreadId) navigate.toThread(item.task.ownerThreadId); };
  const accept = (item: GoalItem) => mutate(rpc.call("accept", { taskId: item.task.id }));
  const reopen = (item: GoalItem) => mutate(rpc.call("reopen", { taskId: item.task.id }));

  const add = async (title: string, status: "todo" | "in_progress") => {
    if (!selectedAddProject || !allowedIds.has(selectedAddProject)) return false;
    try {
      await rpc.call("addTask", { bbProjectId: selectedAddProject, title, status });
      refetch();
      return true;
    } catch (cause) { report(cause); return false; }
  };

  const card = (item: GoalItem) => <GoalCard key={item.task.id} item={item} onOpen={() => open(item)} onAccept={() => accept(item)} onReopen={() => reopen(item)} />;
  const row = (item: GoalItem) => <GoalRow key={item.task.id} item={item} onOpen={() => open(item)} onAccept={() => accept(item)} />;
  const render = (list: GoalItem[]) => compact ? list.map(row) : <div className="td-cards">{list.map(card)}</div>;
  const section = (title: string, list: GoalItem[], emptyText: string, defaultOpen = true) => (
    <Section title={title} count={list.length} defaultOpen={defaultOpen}>{list.length ? render(list) : <Empty>{emptyText}</Empty>}</Section>
  );
  const active = [...needsAnswer, ...inWork, ...review, ...queued];
  const threadsSection = (
    <Section title="Треды без цели" count={unlinkedThreads.length} defaultOpen={false}>
      {unlinkedThreads.map((t) => <AgentRow key={t.id} thread={t} projectName={projectNames.get(t.projectId) ?? ""} />)}
    </Section>
  );

  const bar = (
    <div className="td-bar">
      <OriginTabs value={origin} onChange={setOrigin} />
      <select className="td-select" value={choice} onChange={(e) => setSpaceChoice(e.target.value)} aria-label="Пространство">
        <option value="sidebar">Как в сайдбаре ({spaces?.find((s) => s.id === activeSpaceId)?.name ?? "Все"})</option>
        <option value="all">Все пространства</option>
        {(spaces ?? []).map((s) => <option key={s.id} value={`space:${s.id}`}>{s.name}</option>)}
      </select>
      <select className="td-select" value={filter} onChange={(e) => setProjectSelection({ scope, value: e.target.value })} aria-label="Фильтр по проекту">
        <option value="all">Все проекты</option>
        {spaceProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
  const adder = <AddGoal projects={spaceProjects} projectId={selectedAddProject} onProject={(value) => setAddSelection({ scope, value })} onAdd={add} />;
  const errorLine = error ? <p role="alert" className="td-error">{error}</p> : null;

  if (compact) {
    return <div className="td-goals dock" onKeyDown={(e) => { if (e.key === "Escape") dismiss?.(); }}>
      <style>{GOALS_CSS}</style>
      {bar}
      <div className="td-list">
        {errorLine}
        {tasks === null ? <Empty>Загрузка целей…</Empty> : <>
          <Section title="Задачи" count={active.length}>{active.length ? active.map(row) : <Empty>Активных целей нет.</Empty>}</Section>
          {done.length ? <Section title="Готово" count={done.length} defaultOpen={false}>{done.map(row)}</Section> : null}
          {unlinkedThreads.length ? threadsSection : null}
        </>}
      </div>
      {adder}
    </div>;
  }

  return <div className="td-goals td-page page">
    <style>{GOALS_CSS}</style>
    {bar}
    {adder}
    {errorLine}
    <div className="td-list">
      {tasks === null ? <Empty>Загрузка целей…</Empty> : <>
        {section("Ждёт тебя", needsAnswer, "Нет целей, ожидающих ответа.")}
        {section("В работе", inWork, "Нет целей в работе.")}
        {section("На проверке", review, "Нет целей на проверке.")}
        {section("Очередь", queued, "Очередь пуста.")}
        {section("Готово", done, "Пока ничего.", false)}
        {unlinkedThreads.length ? threadsSection : null}
      </>}
    </div>
  </div>;
}

export function useGoalsBadge() {
  const { tasks } = useOverview();
  const sidebar = useSidebarThreads();
  const byId = new Map(sidebar.threads.map((t) => [t.id, t]));
  const waiting = (task: DockTask) => task.status !== "done" && task.status !== "canceled" && (Boolean(task.ownerThreadId && byId.get(task.ownerThreadId)?.hasPendingInteraction) || descendantThreads(task.ownerThreadId, sidebar.threads, byId).some((t) => t.hasPendingInteraction));
  const pending = (tasks ?? []).filter(waiting).length;
  const review = (tasks ?? []).filter((task) => task.status === "in_review" && !waiting(task)).length;
  const count = pending + review;
  return count ? { count, tone: pending ? "warning" as const : "neutral" as const, label: `Требуют внимания: ${count}` } : null;
}
