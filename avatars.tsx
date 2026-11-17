import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { experimental_useSidebarThreads as useSidebarThreads, experimental_useProviders as useProviders, experimental_ProviderIcon as ProviderIcon, useRpc, useRealtime, useBbNavigate, useRealtimeConnectionState, type PluginSidebarThread } from '@get-bb/plugin-sdk/app';
import type { rpcContract } from './server';
import { CODEX_MODELS, CLAUDE_MODELS, DEFAULT_AVATAR_SETTINGS, type AvatarModel, type AvatarSettings } from './avatar-config';
import { AVATAR_THEME as T, AVATAR_CSS, type PetState } from './avatar-theme';
import { avatarHash, avatarState, celebrationDeadline } from './avatar-state';
import metaJson from './assets/pets/meta.json';
import revision from './assets/pets/revision.json';
const META = metaJson as Record<string, {
    x: number;
    y: number;
    w: number;
    h: number;
}>;
const assetUrl = (model: string) => `/api/v1/plugins/todo-dock/http/pets/${model}.webp?v=${revision}`;
const LABELS: Record<string, string> = { codex: 'Робот', hoots: 'Сова', rocky: 'Камень', seedy: 'Росток', fireball: 'Огонёк', stacky: 'Стопка', dewey: 'Дьюи', crab: 'Краб', 'crab-hermit': 'Отшельник', 'crab-round': 'Круглый', 'crab-pixel': 'Пиксельный', clawd: 'Clawd', 'clawd-headphones': 'В наушниках', 'clawd-hat': 'В шапке', 'clawd-coffee': 'С кофе' };
type Frame = {
    node: HTMLElement;
    state: PetState;
    scale: number;
    animate: boolean;
    speed: number;
    start: number;
    last: number;
};
const frames = new Set<Frame>();
const glyphFrames = new Set<{
    node: HTMLElement;
    speed: number;
    start: number;
}>();
let raf = 0;
let motionQuery: MediaQueryList | null = null;
function draw(now: number) {
    const reduced = motionQuery?.matches ?? false;
    for (const a of frames) {
        const m = T.PET[a.state];
        const f = !a.animate || reduced ? 0 : Math.floor((now - a.start) / (m.ms / a.speed)) % m.n;
        if (f !== a.last) {
            a.last = f;
            a.node.style.backgroundPosition = `${-f * T.frameWidth * a.scale}px ${-m.r * T.frameHeight * a.scale}px`;
        }
    }
    for (const a of glyphFrames)
        a.node.style.transform = `rotate(${reduced ? 0 : ((now - a.start) / (T.childRotationMs / a.speed) * 360) % 360}deg)`;
}
function moving() { return !motionQuery?.matches && (glyphFrames.size > 0 || [...frames].some(a => a.animate && T.PET[a.state].n > 1)); }
function tick(now: number) { raf = 0; draw(now); if (moving())
    raf = requestAnimationFrame(tick); }
function reconcileClock() {
    if (frames.size || glyphFrames.size) {
        if (!motionQuery) {
            motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
            motionQuery.addEventListener('change', reconcileClock);
        }
        draw(performance.now());
        if (moving() && !raf)
            raf = requestAnimationFrame(tick);
    }
    else if (motionQuery) {
        motionQuery.removeEventListener('change', reconcileClock);
        motionQuery = null;
    }
    if (!moving() && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
    }
}
function registerFrame(frame: Frame) { frames.add(frame); reconcileClock(); return () => { frames.delete(frame); reconcileClock(); }; }
export function PetPreview({ model, state = 'work', size = T.defaultSize, hue = 0, animate = true, speed = 1, badges = false }: {
    model: string;
    state?: PetState;
    size?: number;
    hue?: number;
    animate?: boolean;
    speed?: number;
    badges?: boolean;
}) {
    const ref = useRef<HTMLSpanElement>(null);
    const m = META[model];
    const k = m ? Math.min(T.areaRatio * T.frameWidth / Math.sqrt(m.w * m.h), T.frameWidth * T.widthRatio / m.w, T.frameWidth / m.h) : 1;
    const scale = size / T.frameWidth * k;
    useLayoutEffect(() => ref.current ? registerFrame({ node: ref.current, state, scale, animate, speed, start: performance.now(), last: -1 }) : undefined, [model, state, scale, animate, speed]);
    const b = T.BUB[state as keyof typeof T.BUB];
    return <span className={`td-avatar${state === 'sleep' ? ' td-avatar-sleep' : ''}`} style={{ width: size, height: size }} data-state={state} data-model={model}>
    <span ref={ref} className="td-avatar-pet" style={{ width: T.frameWidth * scale, height: T.frameHeight * scale, backgroundImage: `url("${assetUrl(model)}")`, backgroundSize: `${T.frameWidth * T.columns * scale}px ${T.frameHeight * T.rows * scale}px`, filter: hue ? `hue-rotate(${hue}deg)` : undefined, left: m ? size / 2 - (m.x + m.w / 2) * scale : 0, top: m ? size - (m.y + m.h) * scale : 0 }}/>
    {b && (badges || state === 'sleep') ? <span className={`td-avatar-bub ${b[1]}`} aria-hidden="true">{b[0]}</span> : null}
  </span>;
}
type Target = {
    id: string;
    row: HTMLElement;
    original: HTMLElement;
    mount: HTMLSpanElement;
};
function useTargets() {
    const [targets, setTargets] = useState<Target[]>([]);
    useEffect(() => {
        let alive = true, pending = false;
        const mounted = new Map<HTMLElement, Target>();
        const remove = (t: Target) => { t.mount.remove(); t.original.removeAttribute('data-todo-avatar-original'); t.row.removeAttribute('data-todo-avatar-row'); t.row.style.removeProperty('--todo-avatar-row-size'); };
        const scan = () => {
            pending = false;
            if (!alive)
                return;
            const found = new Set<HTMLElement>();
            for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-sidebar-thread-id][href*="/threads/"]'))) {
                const row = anchor.closest<HTMLElement>('[data-sidebar-rename-row]');
                const original = row?.querySelector<HTMLElement>('[data-sidebar-thread-provider]');
                const id = anchor.dataset.sidebarThreadId;
                if (!row || !original || !id)
                    continue;
                found.add(row);
                const old = mounted.get(row);
                if (old && (old.id !== id || old.original !== original || !old.mount.isConnected)) {
                    remove(old);
                    mounted.delete(row);
                }
                if (!mounted.has(row)) {
                    const mount = document.createElement('span');
                    mount.className = 'td-avatar-mount td-avatar-scope';
                    original.before(mount);
                    mounted.set(row, { id, row, original, mount });
                }
            }
            for (const [row, t] of mounted)
                if (!found.has(row)) {
                    remove(t);
                    mounted.delete(row);
                }
            const next = [...mounted.values()];
            setTargets(prev => prev.length === next.length && prev.every((t, i) => t === next[i]) ? prev : next);
        };
        const observer = new MutationObserver(records => {
            const relevant = records.some(record => {
                const target = record.target instanceof Element ? record.target : record.target.parentElement;
                if (target?.closest('.td-avatar-mount'))
                    return false;
                if (target?.closest('[data-testid="app-sidebar-body"]'))
                    return true;
                return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => node instanceof Element && (node.matches('[data-testid="app-sidebar-body"]') || node.querySelector('[data-testid="app-sidebar-body"]')));
            });
            if (relevant && !pending) {
                pending = true;
                queueMicrotask(scan);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'data-sidebar-thread-id', 'data-sidebar-thread-provider'] });
        scan();
        return () => { alive = false; observer.disconnect(); for (const target of mounted.values())
            remove(target); mounted.clear(); };
    }, []);
    return targets;
}
function useAppearance() {
    const read = () => ({ hybrid: document.documentElement.hasAttribute('data-hyb-active'), compact: document.documentElement.dataset.hybDensity === 'compact', reduced: matchMedia('(prefers-reduced-motion: reduce)').matches });
    const [value, setValue] = useState(read);
    useEffect(() => { const update = () => setValue(read()); const observer = new MutationObserver(update); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hyb-active', 'data-hyb-density'] }); const mq = matchMedia('(prefers-reduced-motion: reduce)'); mq.addEventListener('change', update); return () => { observer.disconnect(); mq.removeEventListener('change', update); }; }, []);
    return value;
}
function modelFor(t: PluginSidebarThread, s: AvatarSettings, overrides: Record<string, AvatarModel | null>): AvatarModel | null {
    const list = t.providerId.includes('claude') ? CLAUDE_MODELS : t.providerId.includes('codex') ? CODEX_MODELS : null;
    if (!list)
        return null;
    const override = overrides[t.id];
    if (override && (list as readonly string[]).includes(override))
        return override;
    return s.per === 'thread' ? list[avatarHash(t.id) % list.length] : t.providerId.includes('claude') ? s.claude : s.codex;
}
type MenuState = {
    thread: PluginSidebarThread;
    x: number;
    y: number;
};
export function AvatarOverlay() {
    const { threads } = useSidebarThreads();
    const { providers } = useProviders();
    const rpc = useRpc<typeof rpcContract>();
    const navigate = useBbNavigate();
    const connection = useRealtimeConnectionState();
    const [settings, setSettings] = useState(DEFAULT_AVATAR_SETTINGS);
    const [overrides, setOverrides] = useState<Record<string, AvatarModel | null>>({});
    const [menu, setMenu] = useState<MenuState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [choosing, setChoosing] = useState(false);
    const choosePending = useRef(false);
    const [now, setNow] = useState(Date.now);
    const [deadlines, setDeadlines] = useState<Record<string, number>>({});
    const previous = useRef(new Map<string, string>());
    const appearance = useAppearance();
    const targets = useTargets();
    const visibleIds = targets.map(t => t.id).sort().join(',');
    const settingsGeneration = useRef(0);
    const refresh = useCallback(() => { const generation = ++settingsGeneration.current; rpc.call('avatarSettings', null).then(value => { if (generation === settingsGeneration.current)
        setSettings(value); }, cause => console.warn('Todo Dock avatars: settings', cause)); }, [rpc]);
    const metadataGeneration = useRef(0);
    const refreshMetadata = useCallback(() => {
        const generation = ++metadataGeneration.current;
        const ids = visibleIds ? visibleIds.split(',') : [];
        Promise.all(Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => rpc.call('avatarMetadata', { threadIds: ids.slice(i * 100, i * 100 + 100) }))).then(results => { if (generation === metadataGeneration.current)
            setOverrides(Object.assign({}, ...results.map(r => r.avatars))); }, cause => console.warn('Todo Dock avatars: metadata', cause));
    }, [rpc, visibleIds]);
    useEffect(() => { refresh(); }, [refresh, connection]);
    useEffect(() => { refreshMetadata(); return () => { metadataGeneration.current++; }; }, [refreshMetadata, connection]);
    useRealtime('avatar-changed', () => { refresh(); refreshMetadata(); });
    useEffect(() => { const time = Date.now(); const additions: Record<string, number> = {}; const alive = new Set<string>(); for (const t of threads) {
        alive.add(t.id);
        const until = celebrationDeadline(previous.current.get(t.id), t.status, time, settings.joy);
        if (until)
            additions[t.id] = until;
        previous.current.set(t.id, t.status);
    } for (const id of previous.current.keys())
        if (!alive.has(id))
            previous.current.delete(id); setDeadlines(old => ({ ...Object.fromEntries(Object.entries(old).filter(([id, until]) => alive.has(id) && until > time)), ...additions })); setNow(time); }, [threads, settings.joy]);
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
    useEffect(() => { if (!menu)
        return; const click = (event: Event) => { if (!(event.target as Element).closest('.td-avatar-ctx'))
        setMenu(null); }; const key = (event: KeyboardEvent) => { if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMenu(null);
    } }; document.addEventListener('pointerdown', click, true); document.addEventListener('keydown', key, true); return () => { document.removeEventListener('pointerdown', click, true); document.removeEventListener('keydown', key, true); }; }, [menu]);
    const byId = new Map(threads.map(t => [t.id, t]));
    const size = appearance.compact ? T.compactSize : Math.min(settings.size, T.maxSize);
    useLayoutEffect(() => { for (const target of targets) {
        const t = byId.get(target.id);
        if (t && modelFor(t, settings, overrides)) {
            target.original.setAttribute('data-todo-avatar-original', '');
            target.row.dataset.todoAvatarRow = t.parentThreadId ? 'child' : 'root';
            target.row.style.setProperty('--todo-avatar-row-size', `${appearance.compact ? T.compactSize : T.maxSize}px`);
        }
        else {
            target.original.removeAttribute('data-todo-avatar-original');
            target.row.removeAttribute('data-todo-avatar-row');
            target.row.style.removeProperty('--todo-avatar-row-size');
        }
    } }, [targets, threads, settings, overrides, size, appearance.compact]);
    function choose(model: AvatarModel | null) { if (!menu || choosePending.current)
        return; choosePending.current = true; setChoosing(true); const threadId = menu.thread.id; rpc.call('setAvatarModel', { threadId, model }).then(result => { setOverrides(old => ({ ...old, [threadId]: result.model })); setMenu(null); setError(null); }, cause => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => { choosePending.current = false; setChoosing(false); }); }
    const animated = settings.anim !== 'off' && !appearance.reduced;
    return <><style>{AVATAR_CSS}</style>{targets.map(target => {
            const t = byId.get(target.id);
            if (!t)
                return null;
            const model = modelFor(t, settings, overrides);
            if (!model)
                return null;
            const state = avatarState(t, now, settings.sleep, settings.joy ? deadlines[t.id] ?? 0 : 0);
            const provider = providers.find(p => p.id === t.providerId) ?? { id: t.providerId };
            return createPortal(t.parentThreadId ? <span className="td-avatar-glyph" data-state={state}><ChildGlyph provider={provider} spin={animated && settings.anim === 'all' && !appearance.hybrid && (state === 'work' || state === 'think')} speed={settings.speed}/>{settings.badges && ['need', 'done', 'err'].includes(state) ? <span className={`td-avatar-dot ${state}`}/> : null}</span> : <a href={t.href} draggable={false} aria-label={t.displayTitle} className="td-avatar-link" onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
                event.preventDefault();
                navigate.toThread(t.id);
            } }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setError(null); setMenu({ thread: t, x: event.clientX, y: event.clientY }); }}><PetPreview model={model} state={state} size={size} hue={settings.color === 'project' ? avatarHash(t.projectId) % 360 : 0} animate={animated && (!appearance.hybrid || settings.hybridAnimation === 'animate')} speed={settings.speed} badges={settings.badges}/></a>, target.mount, target.id);
        })}{menu ? createPortal(<div className="td-avatar-ctx td-avatar-scope" role="menu" aria-label="Аватар треда" style={{ left: Math.max(0, Math.min(menu.x, innerWidth - T.menuWidth)), top: Math.max(0, Math.min(menu.y, innerHeight - T.menuHeight)) }} onContextMenu={e => e.preventDefault()}><div className="td-avatar-ctx-title">Аватар треда «{menu.thread.displayTitle}» — навсегда</div>{[null, ...(menu.thread.providerId.includes('claude') ? CLAUDE_MODELS : CODEX_MODELS)].map(model => <button type="button" className="td-avatar-ctx-item" disabled={choosing} role="menuitemradio" aria-checked={(overrides[menu.thread.id] ?? null) === model} key={model ?? 'auto'} onClick={() => choose(model)}><PetPreview model={model ?? modelFor(menu.thread, settings, {}) ?? settings.codex} size={T.contextSize} animate={false}/>{model ? LABELS[model] : 'Авто'}</button>)}{error ? <div role="alert" className="td-avatar-ctx-title td-avatar-error">{error}</div> : null}</div>, document.body) : null}</>;
}
function ChildGlyph({ provider, spin, speed }: {
    provider: {
        id: string;
    };
    spin: boolean;
    speed: number;
}) {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => { if (!spin || !ref.current)
        return; const frame = { node: ref.current, speed, start: performance.now() }; glyphFrames.add(frame); reconcileClock(); return () => { glyphFrames.delete(frame); frame.node.style.removeProperty('transform'); reconcileClock(); }; }, [spin, speed]);
    return <span ref={ref}><ProviderIcon providerKind="agent" provider={provider} className="td-avatar-glyph-icon"/></span>;
}
