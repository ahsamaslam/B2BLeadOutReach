# SendMaster — frontend migration guide

This package replaces your **Material-UI–blue** look with the polished, Notion / Stripe-adjacent **SendMaster** system you signed off on — *without rewriting any business logic*. Routing, API calls, queries, mutations all stay the same.

## What's in this package

```
migration/
├── src/
│   ├── theme/
│   │   ├── tokens.css     # CSS variables — single source of truth for color/type/radius/shadow
│   │   ├── tokens.ts      # Same tokens as TS constants (for canvas/SVG/charts)
│   │   ├── muiTheme.ts    # createTheme(...) — drop into <ThemeProvider>
│   │   └── index.ts       # barrel export
│   │
│   ├── components/
│   │   ├── shell/
│   │   │   ├── Shell.tsx     # <Shell> — the one wrapper every page sits inside
│   │   │   ├── Sidebar.tsx   # left navigation
│   │   │   ├── TopBar.tsx    # breadcrumb + search + actions
│   │   │   └── index.ts
│   │   ├── primitives/
│   │   │   ├── StatCard.tsx     # KPI card with sparkline
│   │   │   ├── StatusChip.tsx   # tone-mapped status pill (green/amber/red/violet/teal)
│   │   │   ├── EmptyState.tsx   # friendly "no data yet" surface
│   │   │   ├── PageHeader.tsx   # eyebrow + h1 + description + actions
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   └── App.example.tsx   # how your App.tsx should look after migration
│
├── MIGRATION.md          # this file
└── AGENT_BRIEF.md        # paste this into your AI agent
```

## Step 1 — Install (no new dependencies)

You already have `@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material` in `package.json`. **Nothing new to install.** Geist + Instrument Serif fonts load via `tokens.css` from Google Fonts.

## Step 2 — Copy files into your repo

Copy `migration/src/theme/` → `frontend/src/theme/`
Copy `migration/src/components/shell/` → `frontend/src/components/shell/`
Copy `migration/src/components/primitives/` → `frontend/src/components/primitives/`

(You can also keep them under any path you prefer — just update the imports.)

## Step 3 — Wire the theme at app root

Edit `frontend/src/index.tsx`:

```tsx
import "./theme/tokens.css";   // ← add this line at the very top

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
```

Now edit `frontend/src/App.tsx` — see `App.example.tsx` for the full diff. The essential change:

```tsx
// OLD — AppBar + Tabs
<AppBar position="static">
  <Toolbar>…<Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>…</Toolbar>
</AppBar>
{activeTab === TAB_DASHBOARD && <Dashboard />}
…

// NEW — ThemeProvider + Shell
<ThemeProvider theme={theme}>
  <CssBaseline />
  <Shell
    active={activeTab}
    onNavigate={setActiveTab}
    isAdmin={isAdmin}
    user={{ name, email, initials }}
    workspace={{ name: "UnionLogix workspace" }}
    usage={{ sent: 72, cap: 200, planLabel: "Free plan" }}
    onLogout={handleLogout}
    crumb={CRUMB[activeTab]}
  >
    {activeTab === "dashboard" && <Dashboard />}
    …
  </Shell>
</ThemeProvider>
```

Change tab IDs from numeric constants (`TAB_DASHBOARD = 0`) to the string union `NavId`. Cleaner, type-safe, future-proof.

## Step 4 — Migrate page bodies (one at a time)

Each existing page (`Dashboard.tsx`, `LeadsList.tsx`, `CampaignTemplates.tsx`, …) **keeps its logic**. You only swap the chrome.

### Dashboard.tsx

| Old | New |
|---|---|
| `<Box sx={{ bgcolor: "grey.50", py: 4 }}><Container>…` | Drop the wrapper. `<Shell>` handles padding & background. |
| The hand-rolled `StatCard` component at the top | `import { StatCard } from "components/primitives"` |
| `linear-gradient(...)` on the H1 | `<PageHeader title="Dashboard" description="…" />` |
| Custom Chip with `bgcolor: alpha("#2e7d32", 0.1)` | `<StatusChip tone="green" label="Opened" />` |
| All `<Card sx={{...heavy border + glow...}}>` | Plain `<Card>` — the theme already styles it |

### LeadsList.tsx

| Old | New |
|---|---|
| `<Typography variant="h5" fontWeight="bold">Upload Leads ({n})</Typography>` | `<PageHeader eyebrow="Step 1 of 3" title="Leads" description="Upload a CSV…" />` |
| `<Paper variant="outlined">` + Step 1 / Step 2 sections | Same Paper, but its border colour now comes from the theme. Style content the same way. |
| Status `<Chip label={status} color={STATUS_COLORS[status]} />` | `<StatusChip tone={toneMap[status]} label={statusLabel(status)} dot />` |
| Empty `<TableRow><TableCell colSpan={10}>No leads found</TableCell></TableRow>` | `<EmptyState icon={<StorageOutlined/>} title="No leads yet" description="…" primaryAction={<Button…/>} />` (render conditionally above the table) |

### CampaignTemplates.tsx

Replace the modal-only "new template" with the **embedded composer panel + list** pattern from the design. Or just keep modal for now — the theme already styles it correctly via `MuiDialog` overrides.

### EmailCampaign.tsx (Broadcast)

This is the biggest visual change. Switch from a single column to the **split view**: lead list (340px) on the left, full email preview on the right. Keep the same data flow.

```tsx
<Shell flush crumb="Broadcast" hideSearch …>
  <Box sx={{ p: "20px 28px 16px", borderBottom: `1px solid ${colors.border}` }}>
    {/* config bar: template picker, mode, portfolio toggle */}
  </Box>
  <Box sx={{ display: "grid", gridTemplateColumns: "340px 1fr", flex: 1 }}>
    <LeadList /> {/* existing component, restyled */}
    <EmailPreview /> {/* existing logic + the styles in the design */}
  </Box>
</Shell>
```

### History.tsx

| Old | New |
|---|---|
| Single big table | Add a **KPI strip** at the top (`StatCard × 4`) for Sent / Opened / Replied / Bounced, then the table |
| `<Chip label="Opened" />` | `<StatusChip tone="green" dot label="Opened · 3×" />` |

### Settings.tsx

Wrap each section (Branding · SMTP · Tracking · Follow-up · DNS) in `<Section icon="…" tone="…" title="…" sub="…">` from `screens/settings-config.jsx` in the design — copy that component over as `components/primitives/Section.tsx` if you want full parity.

### Portfolio.tsx · Pricing.tsx · AdminTenants.tsx

Use the same patterns: `PageHeader` at top, `StatCard` for stats, `StatusChip` for pills, `EmptyState` when empty. Re-skin only — no logic changes.

## Step 5 — Delete what's no longer needed

After every page is migrated:

- Delete the old `<AppBar><Tabs>` block from `App.tsx`
- Delete inline gradient text effects, the `emphasized` flag on old `StatCard`, the custom `STATUS_COLORS` maps (the new `StatusChip` does this)
- Remove `linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)` everywhere — there are no gradients in the new system

## Step 6 — QA checklist

- [ ] All 9 pages render without console errors
- [ ] Sidebar nav highlights match active page
- [ ] No leftover blue (#1976d2, #1565c0, #42a5f5) anywhere
- [ ] Tables on Leads / History / Admin look identical to designs
- [ ] Status chips use the 6 brand tones
- [ ] Empty states show on Leads/Templates/History when API returns `[]`
- [ ] SMTP error banner looks right when wrong creds entered
- [ ] Modals (Add Lead, Edit Lead, Confirm Delete, View Email) feel like the design

## Reference designs

- `SendMaster.html` — main screens
- `SendMaster-Flows.html` — flows, modals, every state, interaction library

Every component in this package corresponds to a section in the design. When in doubt, open the design file and match it.
