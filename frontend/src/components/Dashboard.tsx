import React, { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  ArrowForward,
  AutoAwesome,
  ManageSearch,
  MailOutlined,
  Refresh,
  Send,
  Upload,
} from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { StatusChip } from "./primitives";
import { colors, shadow } from "../theme/tokens";

// ── Types ─────────────────────────────────────────────────────────────────────
type Period = "7d" | "30d" | "all";

interface DashboardProps {
  onShowHistory?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

const FUNNEL_COLORS: Record<string, string> = {
  ink1:  colors.ink1,
  brand: colors.brand,
  amber: colors.amber,
  green: colors.green,
  red:   colors.red,
};

const AVATAR_COLORS = [
  colors.brand, colors.green, colors.violet, colors.amber,
  colors.teal,  colors.red,   colors.brandInk,
];
function avatarColor(initials: string): string {
  let h = 0;
  for (let i = 0; i < initials.length; i++) h = (h * 31 + initials.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function Sparkline({ color = colors.brand, up = true }: { color?: string; up?: boolean }) {
  const pts = up
    ? [6, 5, 7, 4, 5, 4, 3, 2, 4, 1, 2, 1]
    : [2, 3, 1, 4, 2, 5, 3, 6, 2, 7, 4, 8];
  const max = Math.max(...pts), min = Math.min(...pts), range = max - min || 1;
  const w = 80, h = 28;
  const path = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = h - ((v - min) / range) * (h * 0.75) - h * 0.12;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" style={{ display: "block" }}>
      <path d={path} stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const ACTIVITY_ICON: Record<string, { icon: React.ReactNode; bg: string }> = {
  email_opened: { icon: <MailOutlined sx={{ fontSize: 14, color: colors.ink2 }} />,  bg: colors.bgSunken },
  emails_sent:  { icon: <Send sx={{ fontSize: 14, color: "#fff" }} />,               bg: colors.brand },
  ai_drafted:   { icon: <AutoAwesome sx={{ fontSize: 14, color: colors.violet }} />, bg: colors.violetSoft },
  enriched:     { icon: <ManageSearch sx={{ fontSize: 14, color: colors.amber }} />, bg: colors.amberSoft },
  upload:       { icon: <Upload sx={{ fontSize: 14, color: "#fff" }} />,             bg: colors.brand },
};

function StatCard({
  label, value, deltaTone, deltaLabel, sub, up,
}: {
  label: string;
  value: string | number;
  deltaTone: string;
  deltaLabel: string;
  sub: string;
  up?: boolean;
}) {
  const toneColor = deltaTone === "green" ? colors.green : deltaTone === "red" ? colors.red : colors.amber;
  const toneBg    = deltaTone === "green" ? colors.greenSoft : deltaTone === "red" ? colors.redSoft : colors.amberSoft;
  return (
    <Box
      sx={{
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        bgcolor: colors.bgElev,
        p: "16px 18px 14px",
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: colors.ink3, mb: 0.5 }}>
        {label}
      </Typography>
      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
        <Typography sx={{ fontSize: "1.75rem", fontWeight: 700, color: colors.ink1, lineHeight: 1.2 }}>
          {value}
        </Typography>
        <Box sx={{ px: "6px", py: "2px", borderRadius: 999, bgcolor: toneBg }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: toneColor }}>{deltaLabel}</Typography>
        </Box>
      </Box>
      <Typography sx={{ fontSize: 12, color: colors.ink3, mb: 1.5 }}>{sub}</Typography>
      <Sparkline color={toneColor} up={up !== false} />
    </Box>
  );
}

const Dashboard: React.FC<DashboardProps> = ({ onShowHistory }) => {
  const [period, setPeriod] = useState<Period>("30d");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: meData } = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: 60_000 });
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-v2", period],
    queryFn: () => api.getDashboardV2(period),
    refetchInterval: 30_000,
  });

  const hour = new Date().getHours();
  const greet = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const raw = meData?.email?.split("@")[0] ?? "";
  const firstName = (raw.split(".")[0] || raw).replace(/^./, (c) => c.toUpperCase());

  const stats = data?.stats;
  const funnel = data?.funnel ?? [];
  const activity = data?.activity ?? [];
  const recentSent = data?.recent_sent ?? [];
  const totalSent = data?.total_sent ?? 0;

  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const allSelected = recentSent.length > 0 && recentSent.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(recentSent.map((r) => r.id)));

  return (
    <Box>
      {/* Header */}
      <Box mb={3}>
        <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={2}>
          <Box>
            <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.ink3, mb: 0.75 }}>
              Overview · {PERIOD_LABELS[period]}
            </Typography>
            <Typography variant="h3" fontWeight={800} color={colors.ink1} lineHeight={1.2} mb={0.75}>
              Good {greet}{firstName ? `, ${firstName}` : ""}.
            </Typography>
            {stats && (
              <Typography fontSize={14} color={colors.ink3}>
                {stats.emails_sent.value} emails sent this period.{" "}
                {stats.open_rate.value > 0 && (
                  <>Your pipeline is performing at a{" "}
                    <Box component="span" sx={{ color: colors.brand, fontWeight: 600 }}>
                      {stats.open_rate.value}% open rate
                    </Box>.
                  </>
                )}
              </Typography>
            )}
          </Box>
          <Box display="flex" gap={0.5} mt={0.5} flexShrink={0}>
            {(["7d", "30d", "all"] as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "contained" : "outlined"}
                size="small"
                onClick={() => setPeriod(p)}
                sx={{
                  textTransform: "none",
                  fontSize: 12,
                  fontWeight: 500,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: "8px",
                  ...(period === p
                    ? { bgcolor: colors.brand, "&:hover": { bgcolor: colors.brandInk } }
                    : { borderColor: colors.border, color: colors.ink2, "&:hover": { borderColor: colors.borderStrong } }),
                }}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Stat cards */}
      <Box display="flex" gap={2} mb={2.5} sx={{ flexWrap: { xs: "wrap", md: "nowrap" } }}>
        <StatCard label="Leads in pipeline" value={isLoading ? "—" : stats?.leads_in_pipeline.value ?? 0} deltaLabel={stats?.leads_in_pipeline.delta_label ?? ""} deltaTone={stats?.leads_in_pipeline.delta_tone ?? "green"} sub={stats?.leads_in_pipeline.sub ?? ""} up />
        <StatCard label="Emails sent" value={isLoading ? "—" : stats?.emails_sent.value ?? 0} deltaLabel={stats?.emails_sent.delta_label ?? ""} deltaTone={stats?.emails_sent.delta_tone ?? "green"} sub={stats?.emails_sent.sub ?? ""} up />
        <StatCard label="Open rate" value={isLoading ? "—" : `${stats?.open_rate.value ?? 0}%`} deltaLabel={stats?.open_rate.delta_label ?? ""} deltaTone={stats?.open_rate.delta_tone ?? "green"} sub={stats?.open_rate.sub ?? ""} up />
        <StatCard label="Replies" value={isLoading ? "—" : stats?.replies.value ?? 0} deltaLabel={stats?.replies.delta_label ?? ""} deltaTone={stats?.replies.delta_tone ?? "red"} sub={stats?.replies.sub ?? ""} up={false} />
      </Box>

      {/* Funnel + Activity */}
      <Box display="flex" gap={2} mb={2.5} sx={{ flexDirection: { xs: "column", md: "row" } }}>
        {/* Pipeline funnel */}
        <Box sx={{ flex: "0 0 calc(55% - 8px)", border: `1px solid ${colors.border}`, borderRadius: "12px", bgcolor: colors.bgElev, p: "20px 24px" }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
            <Typography fontWeight={700} fontSize={15} color={colors.ink1}>Pipeline funnel</Typography>
            <Button size="small" variant="text" endIcon={<ArrowForward sx={{ fontSize: "13px !important" }} />} onClick={onShowHistory}
              sx={{ fontSize: 12, color: colors.ink3, textTransform: "none", p: "2px 6px" }}>
              Inspect
            </Button>
          </Box>
          <Typography fontSize={12} color={colors.ink3} mb={2.5}>Where your {funnel[0]?.count ?? 0} leads are right now</Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            {funnel.map((row) => (
              <Box key={row.stage}>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography fontSize={13} color={colors.ink2}>{row.stage}</Typography>
                  <Typography fontSize={13} fontWeight={600} color={colors.ink1}>{row.count}</Typography>
                </Box>
                <Box sx={{ height: 7, bgcolor: colors.bgSunken, borderRadius: 999, overflow: "hidden" }}>
                  <Box sx={{ height: "100%", width: `${row.pct}%`, bgcolor: FUNNEL_COLORS[row.color] ?? colors.brand, borderRadius: 999, transition: "width 0.4s ease", minWidth: row.count > 0 ? 8 : 0 }} />
                </Box>
                <Typography fontSize={11} color={colors.ink4} mt={0.25}>{row.pct}%</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Activity feed */}
        <Box sx={{ flex: 1, border: `1px solid ${colors.border}`, borderRadius: "12px", bgcolor: colors.bgElev, p: "20px 24px" }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
            <Typography fontWeight={700} fontSize={15} color={colors.ink1}>Today's activity</Typography>
            <Box display="flex" alignItems="center" gap={0.75} sx={{ px: 1, py: 0.4, borderRadius: 999, bgcolor: colors.greenSoft, border: `1px solid ${colors.greenSoft}` }}>
              <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: colors.green }} />
              <Typography fontSize={11} fontWeight={500} color={colors.green}>Live</Typography>
            </Box>
          </Box>
          <Typography fontSize={12} color={colors.ink3} mb={2.5}>Live feed across your workspace</Typography>
          {activity.length === 0 ? (
            <Typography fontSize={13} color={colors.ink4} textAlign="center" py={3}>No activity yet.</Typography>
          ) : (
            <Box display="flex" flexDirection="column">
              {activity.map((item, idx) => {
                const ic = ACTIVITY_ICON[item.type] ?? ACTIVITY_ICON.email_opened;
                return (
                  <Box key={idx} display="flex" gap={1.5} sx={{ py: 1.5, borderBottom: idx < activity.length - 1 ? `1px solid ${colors.borderSubtle}` : "none" }}>
                    <Box sx={{ width: 28, height: 28, borderRadius: "8px", bgcolor: ic.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.25 }}>
                      {ic.icon}
                    </Box>
                    <Box flex={1} minWidth={0}>
                      <Typography fontSize={13} fontWeight={500} color={colors.ink1} noWrap>{item.title}</Typography>
                      <Typography fontSize={12} color={colors.ink3} noWrap>{item.detail}</Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>

      {/* Recently sent table */}
      <Box sx={{ border: `1px solid ${colors.border}`, borderRadius: "12px", bgcolor: colors.bgElev, overflow: "hidden", boxShadow: shadow.sh1 }}>
        <Box sx={{ px: 3, py: 2, borderBottom: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Box>
            <Typography fontWeight={700} fontSize={15} color={colors.ink1}>Recently sent</Typography>
            <Typography fontSize={12} color={colors.ink3}>Last {recentSent.length} emails leaving your workspace</Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1.5, py: 0.6, border: `1px solid ${colors.border}`, borderRadius: "8px" }}>
              <Refresh sx={{ fontSize: 13, color: colors.ink3 }} />
              <Typography sx={{ fontSize: 12, color: colors.ink3 }}>Auto-refresh · 30s</Typography>
            </Box>
            <Button size="small" variant="text" endIcon={<ArrowForward sx={{ fontSize: "13px !important" }} />} onClick={onShowHistory}
              sx={{ fontSize: 12, color: colors.brand, textTransform: "none", fontWeight: 600 }}>
              View all {totalSent}
            </Button>
          </Box>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ pl: 2, bgcolor: colors.bgSunken }}>
                  <Checkbox size="small" checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={toggleAll}
                    sx={{ color: colors.border, "&.Mui-checked, &.MuiCheckbox-indeterminate": { color: colors.brand } }} />
                </TableCell>
                {["Company", "Recipient", "Subject", "Niche", "Sent", "Status"].map((h) => (
                  <TableCell key={h} sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: colors.ink3, py: 1.25, bgcolor: colors.bgSunken }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {recentSent.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5, color: colors.ink4, fontSize: 13 }}>
                    No emails sent yet — start a broadcast to see results here.
                  </TableCell>
                </TableRow>
              ) : (
                recentSent.map((row) => (
                  <TableRow key={row.id} hover selected={selected.has(row.id)} sx={{ "& td": { py: 1.25 } }}>
                    <TableCell padding="checkbox" sx={{ pl: 2 }}>
                      <Checkbox size="small" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)}
                        sx={{ color: colors.border, "&.Mui-checked": { color: colors.brand } }} />
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ width: 28, height: 28, borderRadius: "7px", bgcolor: avatarColor(row.initials), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Typography sx={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>{row.initials}</Typography>
                        </Box>
                        <Box minWidth={0}>
                          <Typography fontSize={13} fontWeight={500} color={colors.ink1} noWrap>{row.company_name}</Typography>
                          <Typography fontSize={11} color={colors.ink4} noWrap>{row.company_website}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography fontSize={13} color={colors.ink1} noWrap>{row.recipient_name || "—"}</Typography>
                      <Typography fontSize={11} color={colors.ink4} noWrap>{row.recipient_email}</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 260 }}>
                      <Typography fontSize={13} color={colors.ink2} noWrap title={row.subject}>{row.subject || "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      {row.niche ? (
                        <Typography sx={{ fontSize: 11, fontWeight: 500, color: colors.ink3, px: 1, py: 0.25, bgcolor: colors.bgSunken, borderRadius: "6px", display: "inline-block", whiteSpace: "nowrap" }}>
                          {row.niche}
                        </Typography>
                      ) : (
                        <Typography fontSize={12} color={colors.ink4}>—</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography fontSize={12} color={colors.ink3} noWrap>{row.sent_ago}</Typography>
                    </TableCell>
                    <TableCell>
                      <StatusChip tone={row.status === "opened" ? "green" : "brand"} dot label={row.status === "opened" ? "Opened" : "Sent"} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
};

export default Dashboard;