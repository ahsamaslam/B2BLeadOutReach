# SendMaster — frontend theme migration package

This folder is a **drop-in upgrade** for your existing React + Material-UI app. It replaces the generic blue MUI look with the polished SendMaster design system you signed off on, with zero business-logic changes.

## Two ways to use this

### 1. Hand it to your AI agent (recommended)

Open `AGENT_BRIEF.md`, copy the whole file, paste it into Cursor / Claude Code / your tool of choice as the first message. The agent will copy files, rewrite `App.tsx`, and migrate each page using the patterns described.

### 2. Migrate it yourself

Open `MIGRATION.md` and follow Steps 1-6. Should take about 2-4 hours for a careful pass through all 9 pages.

## Quick wins (5 minutes)

If you just want to see the new look applied to your existing app without rewriting any pages:

1. Copy `src/theme/` → `frontend/src/theme/`
2. Add `import "./theme/tokens.css";` to `frontend/src/index.tsx`
3. Wrap `<App />` in `<ThemeProvider theme={theme}><CssBaseline />…</ThemeProvider>` (the `theme` import comes from `./theme`)

Result: every existing MUI button, input, card, table, dialog, chip already looks like the new system — no other changes needed. Pages still use the old `AppBar+Tabs` chrome, but every component inside is restyled. Use this as a "before / after" toggle while you work through the page migrations.

## What you give your designer / PM

Both for reference and review:

- `SendMaster.html` — every main screen
- `SendMaster-Flows.html` — every modal, empty state, loading state, error state, popover, toast, and the full pricing/checkout flow

## File layout

```
migration/
├── README.md             ← you are here
├── MIGRATION.md          ← step-by-step migration for engineers
├── AGENT_BRIEF.md        ← copy-paste prompt for AI coding agents
└── src/
    ├── App.example.tsx
    ├── theme/
    │   ├── tokens.css
    │   ├── tokens.ts
    │   ├── muiTheme.ts
    │   └── index.ts
    └── components/
        ├── index.ts
        ├── shell/
        │   ├── Shell.tsx
        │   ├── Sidebar.tsx
        │   ├── TopBar.tsx
        │   └── index.ts
        └── primitives/
            ├── StatCard.tsx
            ├── StatusChip.tsx
            ├── EmptyState.tsx
            ├── PageHeader.tsx
            └── index.ts
```

## Compatibility

- React ≥ 18
- Material-UI ≥ 5.15
- TypeScript ≥ 4.9
- No new runtime dependencies

All exactly matches your current `frontend/package.json`.
