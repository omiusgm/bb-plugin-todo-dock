// Стили целей и настроек по прототипу v6. Цвета состояний — токены «Гибрида» с откатом на ядро bb.
export const GOALS_CSS = `
.td-goals,.td-avatar-settings{
  --td-need:var(--hyb-state-waiting,var(--attention));
  --td-work:var(--hyb-state-working,var(--primary));
  --td-rev:var(--hyb-state-review,var(--success));
  --td-done:var(--hyb-state-done,var(--muted-foreground));
  --td-err:var(--hyb-state-error,var(--destructive));
  --td-subtle:var(--subtle-foreground,var(--muted-foreground));
}
.td-goals{display:flex;flex-direction:column;min-width:0;font-family:var(--font-sans);color:var(--foreground)}
.td-goals *{box-sizing:border-box}
.td-goals button,.td-goals select,.td-goals input{font-family:inherit}
.td-goals button:focus-visible,.td-goals select:focus-visible,.td-goals input:focus-visible,.td-card:focus-visible,.td-row:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
.td-goals.dock{max-height:20rem;overflow:hidden}
.td-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.dock .td-bar{flex-wrap:wrap;gap:4px;padding:6px 6px 4px;flex:none}
.td-seg{display:inline-flex;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;flex:none}
.td-seg button{height:28px;padding:0 14px;border:0;background:transparent;font-size:12px;font-weight:400;color:var(--muted-foreground);cursor:pointer}
.td-seg button:hover{background:var(--state-hover)}
.td-seg button[aria-pressed="true"]{background:var(--surface-selected);color:var(--foreground);font-weight:600}
.dock .td-seg{width:100%}
.dock .td-seg button{flex:1;height:24px;padding:0 8px;font-size:11px}
.td-select{height:30px;min-width:0;max-width:100%;padding:0 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--secondary);color:var(--foreground);font-size:12px}
.td-select:hover{background:var(--state-hover)}
.dock .td-select{height:24px;padding:0 4px;font-size:11px;flex:1 1 0}
.td-list{display:flex;flex-direction:column;min-height:0}
.dock .td-list{overflow-y:auto;overscroll-behavior:contain;padding:0 6px;flex:1 1 auto}
.td-head{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;margin:6px 0 8px;padding:0;border:0;background:transparent;color:var(--td-subtle);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;text-align:left;cursor:pointer}
.td-head .n{font:400 11px var(--font-mono)}
.dock .td-head{margin:4px 0 2px;padding:4px 8px}
.td-head:hover{color:var(--foreground)}
.td-cards{display:flex;flex-direction:column;gap:8px}
.td-empty{padding:2px 0 6px;font-size:12px;color:var(--td-subtle)}
.dock .td-empty{padding:2px 8px 6px}
.td-error{font-size:12px;color:var(--td-err)}
.td-card{--c:var(--td-done);display:flex;flex-direction:column;gap:6px;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-inline-start:3px solid var(--c);border-radius:0 var(--radius) var(--radius) 0}
.td-card[data-link]{cursor:pointer}
.td-card[data-link]:hover{background-image:linear-gradient(var(--state-hover),var(--state-hover))}
.td-card .top{display:flex;align-items:center;gap:8px}
.td-card .ttl{flex:1;min-width:0;font-size:14px;font-weight:500;line-height:20px;overflow-wrap:anywhere}
.td-card .meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font:11px/16px var(--font-mono);color:var(--td-subtle)}
.td-card .meta svg,.td-card .meta img{width:14px;height:14px;flex:none}
.td-card .meta>span+span::before{content:"·";margin-inline-end:8px;color:var(--td-subtle)}
.td-g{color:var(--c);font-weight:600}
.td-card .sum{border-inline-start:1px solid var(--border);padding-inline-start:12px;font-size:13px;line-height:20px;color:var(--readback-foreground,var(--muted-foreground));overflow-wrap:anywhere}
.td-acts{display:flex;gap:8px;margin-top:2px}
.td-chip{flex:none;padding:0 6px;border:1px solid var(--border);border-radius:4px;background:var(--card);font:400 11px/18px var(--font-sans);white-space:nowrap}
.td-chip[data-k="urgent"]{color:var(--td-err)}
.td-chip[data-k="important"]{color:var(--td-need)}
.td-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--secondary);color:var(--foreground);font-size:13px;font-weight:400;cursor:pointer}
.td-btn:hover{background:var(--state-hover)}
.td-btn svg{width:14px;height:14px}
.td-btn.pri{border-color:var(--primary);background:var(--primary);color:var(--primary-foreground);font-weight:600}
.td-btn.pri:hover{background:color-mix(in srgb,var(--primary) 88%,var(--foreground))}
.td-btn:disabled{opacity:.5;cursor:default}
.td-row{--c:var(--td-done);display:flex;align-items:center;gap:8px;min-height:28px;margin:2px 0;padding:0 8px;border-inline-start:2px solid var(--c);border-radius:0 var(--radius) var(--radius) 0;cursor:pointer;background:transparent;width:100%;text-align:left;border-top:0;border-bottom:0;border-right:0;color:var(--foreground)}
.td-row:hover{background:var(--state-hover)}
.td-row .t{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12.5px;font-weight:400}
.td-row .m{font:11px var(--font-mono);color:var(--td-subtle);flex:none}
.td-row .g{width:12px;text-align:center;font:600 11px var(--font-mono);color:var(--c);flex:none}
.td-row .ok{display:none;width:20px;height:20px;align-items:center;justify-content:center;border:0;border-radius:4px;background:transparent;color:var(--td-rev);cursor:pointer;padding:0}
.td-row .ok svg{width:14px;height:14px}
.td-row .ok:hover{background:var(--state-active,var(--state-hover))}
.td-row:hover .ok,.td-row:focus-within .ok{display:inline-flex}
.td-row:hover .g.has-ok,.td-row:focus-within .g.has-ok{display:none}
[data-k="need"]{--c:var(--td-need)}[data-k="work"]{--c:var(--td-work)}[data-k="rev"]{--c:var(--td-rev)}[data-k="err"]{--c:var(--td-err)}
.td-add{display:flex;align-items:center;gap:4px}
.td-add input{flex:1;min-width:0;height:30px;padding:0 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--background);color:var(--foreground);font-size:13px}
.td-add input::placeholder{color:var(--td-subtle)}
.td-add .td-select{flex:0 1 150px}
.dock .td-add .td-select{flex:0 0 78px;padding:0 2px;font-size:11px}
.dock .td-add .play{display:none}
.td-add .td-btn{padding:0;width:30px;justify-content:center}
.dock .td-add{flex:none;padding:6px;border-top:1px solid var(--border-seam,var(--border))}
.dock .td-add input,.dock .td-add .td-btn{height:28px}
.dock .td-add .td-btn{width:28px}
.page .td-add{margin-bottom:20px}
.td-page{display:flex;flex-direction:column;gap:12px}
.td-page .td-list{gap:0}
.td-page .td-section{margin-bottom:12px}

/* Настройки: сегменты 28px, радиус 6px, без теней */
.td-avatar-settings{display:flex;flex-direction:column;gap:12px}
.td-avatar-option{border:0;padding:0;margin:0;min-width:0}
.td-avatar-option>b{display:block;margin-bottom:6px;font-size:13px;font-weight:500}
.td-avatar-seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.td-avatar-seg button{height:28px;padding:0 12px;border:0;background:transparent;font-size:12px;font-weight:400;color:var(--muted-foreground);cursor:pointer}
.td-avatar-seg button:hover{background:var(--state-hover)}
.td-avatar-seg button[aria-pressed="true"]{background:var(--surface-selected);color:var(--foreground);font-weight:600}
.td-avatar-models{display:flex;gap:6px;flex-wrap:wrap}
.td-avatar-model{display:flex;flex-direction:column;align-items:center;gap:2px;width:64px;padding:4px 2px 3px;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--muted-foreground);font-size:10.5px;font-weight:400;cursor:pointer}
.td-avatar-model:hover{background:var(--state-hover)}
.td-avatar-model[aria-pressed="true"]{border-color:var(--surface-selected-border,var(--ring));background:var(--surface-selected);color:var(--foreground)}
.td-avatar-preview{display:flex;flex-wrap:wrap;gap:16px;align-items:center;padding:8px 0}
.td-avatar-muted{margin-top:6px;font-size:12px;color:var(--muted-foreground)}
.td-avatar-settings [role="alert"]{font-size:12px;color:var(--td-err)}
.td-avatar-settings [role="alert"] button{margin-inline-start:6px;height:24px;padding:0 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--secondary);color:var(--foreground);cursor:pointer}
`;
