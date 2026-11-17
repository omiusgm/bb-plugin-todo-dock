import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { CLAUDE_MODELS, CODEX_MODELS, DEFAULT_AVATAR_SETTINGS, type AvatarSettings } from "./avatar-config";
import { PetPreview } from "./avatars";
import { AVATAR_THEME } from "./avatar-theme";
import { GOALS_CSS } from "./goals-theme";

const MODEL_LABELS: Record<string, string> = {
  codex: "Робот", hoots: "Сова", rocky: "Камень", seedy: "Росток", fireball: "Огонёк", stacky: "Стопка", dewey: "Дьюи",
  crab: "Краб", "crab-hermit": "Отшельник", "crab-round": "Круглый", "crab-pixel": "Пиксельный",
  clawd: "Clawd", "clawd-headphones": "В наушниках", "clawd-hat": "В шапке", "clawd-coffee": "С кофе",
};

export function AvatarSettings() {
  const rpc = useRpc<typeof rpcContract>();
  const [settings, setSettings] = useState<AvatarSettings>(DEFAULT_AVATAR_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = useRef(settings);
  const revision = useRef(0);
  const readGeneration = useRef(0);
  const savedRevision = useRef(0);
  const saving = useRef(false);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(() => {
    const start = revision.current;
    const generation = ++readGeneration.current;
    rpc.call("avatarSettings", null).then((value) => {
      if (!mounted.current || generation !== readGeneration.current || start !== revision.current || saving.current || revision.current !== savedRevision.current) return;
      draft.current = value;
      setSettings(value);
      setLoaded(true);
      setError(null);
    }, (cause: unknown) => {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [rpc]);
  useEffect(() => { refresh(); }, [refresh]);
  useRealtime("avatar-changed", refresh);

  const flush = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      while (savedRevision.current !== revision.current) {
        const version = revision.current;
        const value = draft.current;
        const saved = await rpc.call("saveAvatarSettings", value);
        savedRevision.current = version;
        if (version === revision.current && mounted.current) {
          draft.current = saved;
          setSettings(saved);
          setError(null);
        }
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      saving.current = false;
    }
  }, [rpc]);
  const change = <K extends keyof AvatarSettings>(key: K, value: AvatarSettings[K]) => {
    const next = { ...draft.current, [key]: value };
    draft.current = next;
    revision.current += 1;
    setSettings(next);
    setError(null);
    void flush();
  };
  const segment = <K extends keyof AvatarSettings>(title: string, key: K, options: ReadonlyArray<readonly [AvatarSettings[K], string]>, hint?: string) => (
    <div className="td-avatar-option">
      <b>{title}</b>
      <div className="td-avatar-seg" role="group" aria-label={title}>
        {options.map(([value, label]) => <button type="button" key={String(value)} aria-pressed={settings[key] === value} onClick={() => change(key, value)}>{label}</button>)}
      </div>
      {hint && <div className="td-avatar-muted">{hint}</div>}
    </div>
  );
  const models = (title: string, key: "codex" | "claude", items: readonly string[]) => (
    <div className="td-avatar-option">
      <b>{title}</b>
      <div className="td-avatar-models" role="group" aria-label={title}>
        {items.map((model) => <button className="td-avatar-model" type="button" key={model} aria-pressed={settings[key] === model} onClick={() => change(key, model as AvatarSettings[typeof key])}>
          <span className="td-avatar-preview"><PetPreview model={model} size={AVATAR_THEME.previewSize} animate={settings.anim !== "off"} speed={settings.speed} /></span>
          {MODEL_LABELS[model] ?? model}
        </button>)}
      </div>
    </div>
  );
  return <div className="td-avatar-settings td-avatar-scope"><style>{GOALS_CSS}</style>
    {error && <div role="alert">Не удалось {loaded ? "сохранить или обновить" : "загрузить"} настройки: {error}. <button type="button" onClick={() => revision.current !== savedRevision.current ? void flush() : refresh()}>Повторить</button></div>}
    {loaded && <>
      {segment("Модель агента", "per", [["one", "Одна на всех"], ["thread", "Своя у каждого треда"]], "«Своя» — каждый тред получает своего питомца. Правый клик по аватару — выбрать другого.")}
      {models("Модель Codex", "codex", CODEX_MODELS)}
      {models("Модель Claude", "claude", CLAUDE_MODELS)}
      {segment("Цвет", "color", [["project", "По проекту"], ["single", "Один цвет"]], "«По проекту» — главные треды перекрашены в цвет проекта; субагенты без цвета.")}
      {segment("Анимация", "anim", [["all", "Вся"], ["roots", "Только главные"], ["off", "Выключена"]])}
      {segment("При активном Гибриде", "hybridAnimation", [["animate", "Анимировать"], ["static", "Статичная поза"]])}
      {segment("Скорость анимации", "speed", [[0.6, "Спокойная"], [1, "Обычная"], [1.5, "Живая"]])}
      {segment("Размер аватара", "size", [[32, "S"], [40, "M"], [48, "L"]])}
      {segment("Радость при завершении", "joy", [[true, "Да"], [false, "Нет"]], "3 секунды прыжка, потом «✓ проверь».")}
      {segment("Значки «? ✓ !»", "badges", [[true, "Показывать"], [false, "Скрыть"]])}
      {segment("Уснуть после", "sleep", [[10, "10 мин"], [20, "20 мин"], [30, "30 мин"], [60, "1 час"]], "Отсчёт начинается, когда тред прочитан.")}
    </>}
  </div>;
}
