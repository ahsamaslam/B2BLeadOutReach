# SendMaster — drop-in brief for your coding agent

Copy everything below this line and paste it into Cursor / Claude Code / your AI coding agent of choice. Keep it as the **first message** of the migration chat.

---

## TASK

You are migrating an existing React + Material-UI app called **SendMaster** (a custom B2B email sender) from its current generic-blue MUI look to a new polished design system. The new design system lives in **`migration/`** and the visual reference lives in `SendMaster.html` + `SendMaster-Flows.html`.

**Do not change business logic, API calls, react-query hooks, or routing.** Only swap the visual chrome. Every existing page (`Dashboard`, `LeadsList`, `CampaignTemplates`, `EmailCampaign`, `History`, `Settings`, `Portfolio`, `Pricing`, `AdminTenants`, `Login`) keeps its data layer.

## STEP-BY-STEP

### 1. Set up the theme

- Copy `migration/src/theme/` → `frontend/src/theme/`
- Copy `migration/src/components/shell/` → `frontend/src/components/shell/`
- Copy `migration/src/components/primitives/` → `frontend/src/components/primitives/`
- Add `import "./theme/tokens.css";` as the **first import** in `frontend/src/index.tsx`
- Wrap `<App />` in `<ThemeProvider theme={theme}><CssBaseline />…</ThemeProvider>` — see `migration/src/App.example.tsx`

### 2. Rewrite `App.tsx`

Replace the `<AppBar><Tabs>` setup with `<Shell active={activeTab} onNavigate={…} crumb={…} …>` from `components/shell`. Convert the `TAB_*` numeric constants to the string union `NavId = "dashboard" | "leads" | "templates" | "broadcast" | "history" | "settings" | "pricing" | "admin"`.

### 3. Migrate pages one at a time

For each page in `frontend/src/components/*.tsx`:

1. Remove its outer `<Container>` + `<AppBar>` chrome (Shell handles it).
2. Add a `<PageHeader eyebrow="…" title="…" description="…" actions={…} />` at the top.
3. Replace inline KPI cards with `<StatCard label value delta deltaTone sub sparkline />`.
4. Replace inline status pills (`<Chip color="success" />`) with `<StatusChip tone="green" dot label="…" />` — see the tone map below.
5. When a list has no data, render `<EmptyState icon title description primaryAction />` instead of an empty table.
6. **Do not invent new colors.** Only use values from `theme/tokens.ts` or the CSS variables in `tokens.css`.
7. **Delete every `linear-gradient(…)`** — the new system has none.
8. **Delete every `alpha("#1976d2", 0.05)`-style ad-hoc tint** — use the soft tones from the theme.

### 4. Tone map for `StatusChip`

| Old status | New `tone` |
|---|---|
| `created`, `uploaded`, `default` | `default` (no color) |
| `scraping`, `enriching`, `pending`, `awaiting_approval` | `amber` |
| `data_parsed`, `enriched` | `brand` (or no tone) |
| `drafted` | `violet` |
| `approved` | `violet` (light) |
| `sent` | `brand` |
| `opened` | `green` |
| `replied` | `violet` |
| `bounced`, `error` | `red` |
| `independent` | `default` |
| `franchise` | `amber` |

### 5. Reference for each page

Open `SendMaster.html` for the main layout per page. Open `SendMaster-Flows.html` for every empty/loading/error state and modal. Pixel-match what you see.

### 6. Forbidden patterns

- ❌ `bgcolor: alpha(theme.palette.primary.main, 0.02)` — use `colors.brandSoft` or the theme's existing tones
- ❌ `background: "linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)"`
- ❌ `boxShadow: theme.shadows[8]` on hover — the new system is flat-with-borders, not glowing
- ❌ Emoji-decorated status pills (`⏳ Pending`) — use a colored dot + text
- ❌ Inventing icons. Use `@mui/icons-material` only; if the design shows a custom icon, ask before drawing SVG inline.

### 7. Required patterns

- ✅ Every page starts with `<PageHeader />`
- ✅ Every list has an `<EmptyState />` fallback
- ✅ Every long-running action shows progress (`LinearProgress` + per-row status)
- ✅ Every error has a banner with a clear "what to do next" message
- ✅ Use `useQuery` / `useMutation` exactly as before — they're already correct
- ✅ Keep the `react-hot-toast` `<Toaster />` mounted; styling is automatic now

### 8. Definition of done

- [ ] `npm run build` succeeds with no TS errors
- [ ] No file imports from `@mui/material` colors palette directly (`blue`, `indigo`, etc.)
- [ ] `grep -r "1976d2\|1565c0\|42a5f5\|0288d1" frontend/src` returns nothing
- [ ] Every page renders with no console errors
- [ ] Visual diff to `SendMaster.html` is within reason on at least Dashboard, Leads, Broadcast, History, Settings
- [ ] Admin page is gated behind `isAdmin` (don't show the sidebar item otherwise)

### 9. What to ask before doing

Always ask before:

- Renaming a public prop on `<Dashboard>`, `<LeadsList>`, etc. (changes might break the rest of the app)
- Removing a feature flag, button, or section (might be needed)
- Adding a new dependency (we're trying to stay within current `package.json`)

Otherwise, work autonomously and surface a summary of what you changed.

---

End of brief.
