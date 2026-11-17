/** Replace this file to change the entire avatar appearance. Prototype v5 values.
 * Only frame geometry describes the asset format; all presentation lives here. */
export const AVATAR_THEME = {
    frameWidth: 96, frameHeight: 104, columns: 8, rows: 11,
    areaRatio: .72, widthRatio: .98,
    previewSize: 44, contextSize: 36, defaultSize: 40, maxSize: 40, compactSize: 28,
    celebrationMs: 3000, childRotationMs: 2600, menuWidth: 260, menuHeight: 240,
    PET: {
        work: { r: 7, n: 6, ms: 170 }, think: { r: 6, n: 6, ms: 280 },
        need: { r: 3, n: 4, ms: 220 }, celebrate: { r: 8, n: 6, ms: 150 },
        done: { r: 3, n: 4, ms: 480 }, err: { r: 5, n: 8, ms: 420 },
        sleep: { r: 0, n: 1, ms: 1e9 }, rest: { r: 0, n: 1, ms: 1e9 },
        start: { r: 4, n: 5, ms: 170 },
    },
    BUB: { need: ['?', 'need'], done: ['✓', 'ok'], err: ['!', 'err'], sleep: ['z z', 'z'] },
} as const;
export type PetState = keyof typeof AVATAR_THEME.PET;
export const AVATAR_CSS = `
.td-avatar-scope {
 --todo-avatar-working:var(--hyb-state-working,var(--primary));
 --todo-avatar-waiting:var(--hyb-state-waiting,var(--attention));
 --todo-avatar-review:var(--hyb-state-review,var(--success));
 --todo-avatar-done:var(--hyb-state-done,var(--muted-foreground));
 --todo-avatar-error:var(--hyb-state-error,var(--destructive));
 --todo-avatar-bubble-top:-8px;--todo-avatar-bubble-right:-9px;
 --todo-avatar-bubble-size:17px;--todo-avatar-bubble-radius:7px;
 --todo-avatar-bubble-fill:linear-gradient(#fff,#e9e4dc);
 --todo-avatar-bubble-border:#1d1a22;--todo-avatar-bubble-tail:#ece7df;
 --todo-avatar-bubble-shadow:0 2px 0 rgba(0,0,0,.35);
 --todo-avatar-sleep-filter:grayscale(.75) brightness(.72);
 --todo-avatar-gap:8px;--todo-avatar-glyph-size:18px;
 --todo-avatar-dot-size:8px;--todo-avatar-dot-offset:-2px;
 --todo-avatar-menu-shadow:0 8px 24px rgba(0,0,0,.4);
}
[data-todo-avatar-row="root"] {height:var(--todo-avatar-row-size,40px)!important;max-height:40px}
[data-todo-avatar-row] [data-todo-avatar-original] {display:none!important}
.td-avatar-mount {position:relative;z-index:31;display:inline-flex;align-items:center;justify-content:center;flex:none;margin-right:var(--todo-avatar-gap);pointer-events:none;align-self:center}
.td-avatar-link {pointer-events:auto;display:inline-flex;background:transparent}
.td-avatar {position:relative;display:flex;align-items:flex-end;justify-content:center;flex:none;pointer-events:none}
.td-avatar-pet {position:absolute;background-repeat:no-repeat;pointer-events:none}
.td-avatar-sleep .td-avatar-pet {filter:var(--todo-avatar-sleep-filter)!important}
.td-avatar-bub {position:absolute;right:var(--todo-avatar-bubble-right);top:var(--todo-avatar-bubble-top);min-width:var(--todo-avatar-bubble-size);height:var(--todo-avatar-bubble-size);padding:0 3px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font:900 12px/1 ui-rounded,"SF Pro Rounded",system-ui;background:var(--todo-avatar-bubble-fill);border:2px solid var(--todo-avatar-bubble-border);border-radius:var(--todo-avatar-bubble-radius);box-shadow:var(--todo-avatar-bubble-shadow)}
.td-avatar-bub:after {content:"";position:absolute;left:2px;bottom:-5px;width:6px;height:6px;background:var(--todo-avatar-bubble-tail);border-left:2px solid var(--todo-avatar-bubble-border);border-bottom:2px solid var(--todo-avatar-bubble-border);transform:skewY(-35deg)}
.td-avatar-bub.need {color:var(--todo-avatar-waiting)}
.td-avatar-bub.ok {color:var(--todo-avatar-review)}
.td-avatar-bub.err {color:var(--todo-avatar-error)}
.td-avatar-bub.z {background:none;border:none;box-shadow:none;color:var(--todo-avatar-done);font-size:10px;letter-spacing:1px}
.td-avatar-bub.z:after {display:none}
:root[data-hyb-active] .td-avatar-bub,:root[data-hyb-active] .td-avatar-dot {display:none}
.td-avatar-mount:empty {display:none}
.td-avatar-glyph {width:22px;height:22px;position:relative;display:flex;align-items:center;justify-content:center;pointer-events:none}
.td-avatar-glyph-icon {width:var(--todo-avatar-glyph-size);height:var(--todo-avatar-glyph-size)}
.td-avatar-dot {position:absolute;right:var(--todo-avatar-dot-offset);top:var(--todo-avatar-dot-offset);width:var(--todo-avatar-dot-size);height:var(--todo-avatar-dot-size);border-radius:50%}
.td-avatar-dot.need {background:var(--todo-avatar-waiting)}
.td-avatar-dot.done {background:var(--todo-avatar-review)}
.td-avatar-dot.err {background:var(--todo-avatar-error)}
.td-avatar-glyph[data-state="sleep"] {opacity:.45}
.td-avatar-ctx {position:fixed;z-index:1000;background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:10px;padding:6px;display:grid;grid-template-columns:repeat(4,58px);gap:4px;box-shadow:var(--todo-avatar-menu-shadow);max-height:calc(100vh - 16px);overflow:auto}
.td-avatar-ctx-title {grid-column:1/-1;font-size:11px;color:var(--muted-foreground);padding:2px 4px 4px;max-width:240px}
.td-avatar-ctx-item {display:flex;flex-direction:column;align-items:center;font-size:10px;color:var(--muted-foreground);padding:3px;border-radius:8px;cursor:pointer;border:0;background:transparent}
.td-avatar-ctx-item:hover,.td-avatar-ctx-item[aria-checked="true"] {background:var(--accent);color:var(--foreground)}
.td-avatar-error {color:var(--todo-avatar-error);font-size:12px}
.td-avatar-settings button:focus-visible,.td-avatar-ctx button:focus-visible {outline:2px solid var(--ring);outline-offset:2px}
@media(prefers-reduced-motion:reduce) {.td-avatar-scope * {animation:none!important;transition:none!important}}
`;
