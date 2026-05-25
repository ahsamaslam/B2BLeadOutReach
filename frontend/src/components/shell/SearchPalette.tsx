import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  Dialog,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArticleOutlined,
  BookmarkBorderOutlined,
  HistoryOutlined,
  SearchOutlined,
  StorageOutlined,
} from "@mui/icons-material";
import { api } from "../../services/api";
import { colors } from "../../theme/tokens";
import type { NavId } from "./Sidebar";

interface Result {
  id: string;
  label: string;
  sub: string;
  section: string;
  navId: NavId;
  Icon: typeof StorageOutlined;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (id: NavId) => void;
}

function useDebounce(value: string, ms: number) {
  const [deb, setDeb] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return deb;
}

export const SearchPalette: React.FC<Props> = ({ open, onClose, onNavigate }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const dq = useDebounce(q, 220);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when palette opens
  useEffect(() => {
    if (open) { setQ(""); setResults([]); setCursor(0); }
  }, [open]);

  // Search across APIs
  useEffect(() => {
    if (!dq.trim()) { setResults([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [companies, templates, history] = await Promise.allSettled([
          api.getCompanies({ search: dq, limit: 5 }),
          api.getCampaignTemplates(),
          api.getHistory({ q: dq, page_size: 5 }),
        ]);

        if (cancelled) return;

        const out: Result[] = [];

        // Leads
        if (companies.status === "fulfilled") {
          (companies.value as any[]).slice(0, 5).forEach((c: any) => {
            out.push({
              id: `lead-${c.id}`,
              label: c.name,
              sub: [c.niche, c.location].filter(Boolean).join(" · ") || c.website || "",
              section: "Leads",
              navId: "leads",
              Icon: StorageOutlined,
            });
          });
        }

        // Templates (client-side filter)
        if (templates.status === "fulfilled") {
          const term = dq.toLowerCase();
          (templates.value as any[])
            .filter((t: any) =>
              t.name?.toLowerCase().includes(term) ||
              t.subject_template?.toLowerCase().includes(term)
            )
            .slice(0, 4)
            .forEach((t: any) => {
              out.push({
                id: `tmpl-${t.id}`,
                label: t.name,
                sub: t.subject_template || "",
                section: "Templates",
                navId: "templates",
                Icon: ArticleOutlined,
              });
            });
        }

        // Sent history
        if (history.status === "fulfilled") {
          const items = (history.value as any)?.items ?? [];
          items.slice(0, 4).forEach((h: any) => {
            out.push({
              id: `hist-${h.id}`,
              label: h.company_name || h.recipient_email,
              sub: h.subject || h.recipient_email || "",
              section: "Sent history",
              navId: "history",
              Icon: HistoryOutlined,
            });
          });
        }

        setResults(out);
        setCursor(0);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [dq]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      if (e.key === "Enter" && results[cursor]) { pick(results[cursor]); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, results, cursor]);

  const pick = (r: Result) => {
    onNavigate(r.navId);
    onClose();
  };

  // Group results by section
  const sections: Record<string, Result[]> = {};
  results.forEach((r) => {
    if (!sections[r.section]) sections[r.section] = [];
    sections[r.section].push(r);
  });

  const flatIdx: Result[] = results; // for cursor tracking

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          width: 560,
          maxWidth: "95vw",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          mt: "10vh",
          verticalAlign: "top",
        },
      }}
      sx={{ alignItems: "flex-start" }}
    >
      {/* Search input */}
      <Box sx={{ px: "14px", pt: "14px", pb: "10px", borderBottom: `1px solid ${colors.border}` }}>
        <TextField
          inputRef={inputRef}
          autoFocus
          fullWidth
          placeholder="Search leads, templates, sent history…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          size="small"
          variant="standard"
          InputProps={{
            disableUnderline: true,
            startAdornment: (
              <InputAdornment position="start">
                {loading
                  ? <CircularProgress size={15} sx={{ color: colors.ink3 }} />
                  : <SearchOutlined sx={{ fontSize: 18, color: colors.ink3 }} />}
              </InputAdornment>
            ),
            sx: { fontSize: 15, fontWeight: 500, py: "2px" },
          }}
        />
      </Box>

      {/* Results */}
      <Box sx={{ maxHeight: 400, overflowY: "auto" }}>
        {!q.trim() ? (
          <Box sx={{ px: 3, py: 4, textAlign: "center" }}>
            <Typography fontSize={13} color={colors.ink3}>
              Type to search across leads, templates, and sent history
            </Typography>
          </Box>
        ) : results.length === 0 && !loading ? (
          <Box sx={{ px: 3, py: 4, textAlign: "center" }}>
            <Typography fontSize={13} color={colors.ink3}>No results for "{q}"</Typography>
          </Box>
        ) : (
          Object.entries(sections).map(([section, items]) => (
            <Box key={section}>
              <Typography
                sx={{
                  px: "14px",
                  pt: "10px",
                  pb: "4px",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: colors.ink4,
                }}
              >
                {section}
              </Typography>
              {items.map((r) => {
                const isCursor = flatIdx.indexOf(r) === cursor;
                return (
                  <Box
                    key={r.id}
                    onClick={() => pick(r)}
                    onMouseEnter={() => setCursor(flatIdx.indexOf(r))}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      px: "14px",
                      py: "9px",
                      cursor: "pointer",
                      bgcolor: isCursor ? colors.bgSunken : "transparent",
                      "&:hover": { bgcolor: colors.bgSunken },
                    }}
                  >
                    <Box
                      sx={{
                        width: 30,
                        height: 30,
                        borderRadius: "8px",
                        bgcolor: isCursor ? colors.brandSoft : colors.bgElev,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <r.Icon sx={{ fontSize: 15, color: isCursor ? colors.brand : colors.ink3 }} />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: colors.ink1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.label}
                      </Typography>
                      {r.sub && (
                        <Typography
                          sx={{
                            fontSize: 11.5,
                            color: colors.ink3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.sub}
                        </Typography>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: 11, color: colors.ink4, flexShrink: 0 }}>
                      {r.navId === "leads" ? "Go to Leads" : r.navId === "templates" ? "Go to Templates" : "Go to History"}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          ))
        )}
      </Box>

      {/* Footer hint */}
      {results.length > 0 && (
        <Box
          sx={{
            px: "14px",
            py: "8px",
            borderTop: `1px solid ${colors.border}`,
            display: "flex",
            gap: "16px",
            bgcolor: colors.bgSunken,
          }}
        >
          {[["↑↓", "navigate"], ["↵", "open"], ["esc", "close"]].map(([key, label]) => (
            <Box key={key} sx={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <Box
                sx={{
                  fontSize: 11,
                  px: "5px",
                  py: "1px",
                  bgcolor: colors.bgElev,
                  border: `1px solid ${colors.border}`,
                  borderRadius: "4px",
                  fontFamily: "var(--font-mono)",
                  color: colors.ink3,
                }}
              >
                {key}
              </Box>
              <Typography sx={{ fontSize: 11, color: colors.ink4 }}>{label}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </Dialog>
  );
};
