// @ts-nocheck â€“ full rewrite; old types removed
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Pagination,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Autorenew,
  DeleteOutline,
  Download,
  ForwardToInbox,
  MarkEmailRead,
  MarkEmailUnread,
  Reply,
  Search,
  Shield,
  TuneOutlined,
} from "@mui/icons-material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";
import { colors } from "../theme/tokens";

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "â€”";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " Â· " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function fmtChartDate(iso: string): string {
  return String(new Date(iso).getDate());
}

function csvEscape(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n"))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// â”€â”€ engagement badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function EngagementBadge({
  status,
  openCount,
  repliedAt,
}: {
  status: string;
  openCount: number;
  repliedAt: string | null;
}) {
  if (repliedAt) {
    return (
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          px: "8px",
          py: "3px",
          bgcolor: colors.greenSoft,
          borderRadius: "7px",
        }}
      >
        <Reply sx={{ fontSize: 11, color: colors.green }} />
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.green }}>
          Replied
        </Typography>
      </Box>
    );
  }
  if (status === "bounced") {
    return (
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          px: "8px",
          py: "3px",
          bgcolor: colors.redSoft,
          borderRadius: "7px",
        }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.red }}>
          â— Bounced
        </Typography>
      </Box>
    );
  }
  if (openCount > 0) {
    return (
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          px: "8px",
          py: "3px",
          bgcolor: colors.greenSoft,
          borderRadius: "7px",
        }}
      >
        <MarkEmailRead sx={{ fontSize: 11, color: colors.green }} />
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.green }}>
          Opened{openCount > 1 ? ` Â· ${openCount}Ã—` : ""}
        </Typography>
      </Box>
    );
  }
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        px: "8px",
        py: "3px",
        bgcolor: colors.bgSunken,
        borderRadius: "7px",
        border: `1px solid ${colors.border}`,
      }}
    >
      <MarkEmailUnread sx={{ fontSize: 11, color: colors.ink4 }} />
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.ink4 }}>
        Not opened
      </Typography>
    </Box>
  );
}

// â”€â”€ stat card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatCardHist({
  icon,
  iconBg,
  label,
  value,
  sub,
  subColor,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: number | string;
  sub: string;
  subColor?: string;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 140,
        bgcolor: colors.bgElev,
        borderRadius: "12px",
        border: `1px solid ${colors.border}`,
        px: "18px",
        py: "14px",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: "9px",
          bgcolor: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: colors.ink4,
            mb: "2px",
          }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            fontSize: 26,
            fontWeight: 800,
            color: colors.ink1,
            lineHeight: 1,
          }}
        >
          {value}
        </Typography>
        <Typography
          sx={{ fontSize: 11, color: subColor ?? colors.ink4, mt: "3px" }}
        >
          {sub}
        </Typography>
      </Box>
    </Box>
  );
}

// â”€â”€ custom recharts tooltip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = new Date(label);
  const dateStr = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <Box
      sx={{
        bgcolor: colors.bgElev,
        border: `1px solid ${colors.border}`,
        borderRadius: "8px",
        px: "12px",
        py: "8px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
      }}
    >
      <Typography
        sx={{ fontSize: 11, fontWeight: 700, color: colors.ink2, mb: "4px" }}
      >
        {dateStr}
      </Typography>
      {payload.map((p: any) => (
        <Box
          key={p.dataKey}
          sx={{ display: "flex", alignItems: "center", gap: "6px", mb: "2px" }}
        >
          <Box
            sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: p.fill }}
          />
          <Typography
            sx={{
              fontSize: 11,
              color: colors.ink3,
              textTransform: "capitalize",
            }}
          >
            {p.dataKey}:
          </Typography>
          <Typography
            sx={{ fontSize: 11, fontWeight: 600, color: colors.ink1 }}
          >
            {p.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

// â”€â”€ constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DATE_RANGE_OPTIONS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All status" },
  { value: "opened", label: "Opened" },
  { value: "replied", label: "Replied" },
  { value: "not_opened", label: "Not opened" },
  { value: "bounced", label: "Bounced" },
];

// â”€â”€ main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const History: React.FC = () => {
  const queryClient = useQueryClient();

  // filters
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState("7d");
  const [nicheFilter, setNicheFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // auto-refresh
  const [autoRefreshSec, setAutoRefreshSec] = useState(30);
  const [refreshMenuEl, setRefreshMenuEl] = useState<null | HTMLElement>(null);
  const intervalRef = useRef<any>(null);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, dateRange, nicheFilter]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["historyStats"] });
    queryClient.invalidateQueries({ queryKey: ["historyChart"] });
    queryClient.invalidateQueries({ queryKey: ["history"] });
  }, [queryClient]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefreshSec > 0) {
      intervalRef.current = setInterval(invalidate, autoRefreshSec * 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefreshSec, invalidate]);

  // queries
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["historyStats"],
    queryFn: api.getHistoryStats,
    staleTime: 30_000,
  });

  const { data: chartData = [], isLoading: chartLoading } = useQuery({
    queryKey: ["historyChart"],
    queryFn: () => api.getHistoryChart(14),
    staleTime: 30_000,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: [
      "history",
      debouncedQ,
      statusFilter,
      dateRange,
      nicheFilter,
      page,
    ],
    queryFn: () =>
      api.getHistory({
        q: debouncedQ || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        date_range: dateRange,
        niche: nicheFilter || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    staleTime: 20_000,
  });

  const { data: niches = [] } = useQuery({
    queryKey: ["historyNiches"],
    queryFn: api.getHistoryNiches,
    staleTime: 300_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteEmailLog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["historyStats"] });
      toast.success("Deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const handleExportCsv = useCallback(() => {
    const items = historyData?.items ?? [];
    if (!items.length) {
      toast.error("No data to export");
      return;
    }
    const header = [
      "Company",
      "Domain",
      "Niche",
      "Location",
      "Recipient",
      "Email",
      "Subject",
      "Status",
      "Open count",
      "Sent at",
    ].join(",");
    const rows = items.map((r: any) =>
      [
        r.company_name,
        r.company_domain,
        r.niche ?? "",
        r.location ?? "",
        r.recipient_name ?? "",
        r.recipient_email,
        r.subject,
        r.replied_at ? "replied" : r.status,
        String(r.open_count),
        r.sent_at ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sent_history_${dateRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }, [historyData, dateRange]);

  const items = historyData?.items ?? [];
  const totalPages = historyData?.pages ?? 1;
  const totalItems = historyData?.total ?? 0;
  const tealSoft = "#d4f0ef";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 56px)",
        overflow: "hidden",
        bgcolor: colors.bg,
      }}
    >
      <Box sx={{ flex: 1, overflowY: "auto", px: "28px", py: "20px" }}>
        {/* â”€â”€ Page header â”€â”€ */}
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            mb: "18px",
          }}
        >
          <Box>
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: colors.ink4,
                mb: "4px",
              }}
            >
              {stats
                ? `${stats.total_sent} emails sent Â· 7-day window`
                : "Sent history"}
            </Typography>
            <Typography
              variant="h2"
              fontWeight={800}
              color={colors.ink1}
              lineHeight={1.15}
            >
              Sent history
            </Typography>
            <Typography sx={{ fontSize: 13, color: colors.ink3, mt: "4px" }}>
              Every email that has left your sender. Tracks{" "}
              <Box component="span" sx={{ color: colors.brand }}>
                opens
              </Box>
              ,{" "}
              <Box component="span" sx={{ color: colors.green }}>
                replies
              </Box>{" "}
              and{" "}
              <Box component="span" sx={{ color: colors.red }}>
                bounces
              </Box>{" "}
              in real time.
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              mt: "4px",
            }}
          >
            <Button
              variant="outlined"
              size="small"
              onClick={(e) => setRefreshMenuEl(e.currentTarget)}
              startIcon={<Autorenew sx={{ fontSize: "13px !important" }} />}
              sx={{
                textTransform: "none",
                fontSize: 12,
                borderColor: colors.border,
                color: colors.ink2,
                borderRadius: "8px",
              }}
            >
              Auto-refresh: {autoRefreshSec > 0 ? `${autoRefreshSec}s` : "Off"}
            </Button>
            <Menu
              anchorEl={refreshMenuEl}
              open={Boolean(refreshMenuEl)}
              onClose={() => setRefreshMenuEl(null)}
              PaperProps={{
                sx: {
                  borderRadius: "10px",
                  border: `1px solid ${colors.border}`,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
                  minWidth: 130,
                },
              }}
            >
              {[10, 30, 60, 0].map((s) => (
                <MenuItem
                  key={s}
                  selected={autoRefreshSec === s}
                  sx={{ fontSize: 13 }}
                  onClick={() => {
                    setAutoRefreshSec(s);
                    setRefreshMenuEl(null);
                  }}
                >
                  {s === 0 ? "Off" : `Every ${s}s`}
                </MenuItem>
              ))}
            </Menu>
            <Button
              variant="outlined"
              size="small"
              onClick={handleExportCsv}
              startIcon={<Download sx={{ fontSize: "13px !important" }} />}
              sx={{
                textTransform: "none",
                fontSize: 12,
                borderColor: colors.border,
                color: colors.ink2,
                borderRadius: "8px",
              }}
            >
              Export CSV
            </Button>
          </Box>
        </Box>

        {/* â”€â”€ Stats row â”€â”€ */}
        <Box
          sx={{ display: "flex", gap: "12px", mb: "20px", flexWrap: "wrap" }}
        >
          <StatCardHist
            icon={<ForwardToInbox sx={{ fontSize: 18, color: colors.brand }} />}
            iconBg={colors.brandSoft}
            label="Total Sent"
            value={statsLoading ? "â€¦" : (stats?.total_sent ?? 0)}
            sub={stats ? `+${Math.max(0, stats.delta_week)} this week` : ""}
            subColor={
              stats && stats.delta_week > 0 ? colors.green : colors.ink4
            }
          />
          <StatCardHist
            icon={<MarkEmailRead sx={{ fontSize: 18, color: colors.green }} />}
            iconBg={colors.greenSoft}
            label="Opened"
            value={statsLoading ? "â€¦" : (stats?.opened ?? 0)}
            sub={stats ? `${stats.open_rate}% open rate` : ""}
          />
          <StatCardHist
            icon={<Reply sx={{ fontSize: 18, color: "#2b7d7a" }} />}
            iconBg={tealSoft}
            label="Replies"
            value={statsLoading ? "â€¦" : (stats?.replied ?? 0)}
            sub={stats ? `${stats.reply_rate}% reply rate` : ""}
          />
          <StatCardHist
            icon={<Shield sx={{ fontSize: 18, color: colors.red }} />}
            iconBg={colors.redSoft}
            label="Bounces"
            value={statsLoading ? "â€¦" : (stats?.bounced ?? 0)}
            sub="Check your DMARC"
            subColor={colors.red}
          />
        </Box>

        {/* â”€â”€ Chart â”€â”€ */}
        <Box
          sx={{
            bgcolor: colors.bgElev,
            borderRadius: "14px",
            border: `1px solid ${colors.border}`,
            px: "20px",
            pt: "16px",
            pb: "12px",
            mb: "20px",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: "10px",
            }}
          >
            <Box>
              <Typography
                sx={{ fontSize: 15, fontWeight: 700, color: colors.ink1 }}
              >
                Sent volume vs opens
              </Typography>
              <Typography sx={{ fontSize: 12, color: colors.ink4 }}>
                Daily â€” last 14 days
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "2px",
                    bgcolor: colors.brand,
                  }}
                />
                <Typography sx={{ fontSize: 11, color: colors.ink3 }}>
                  Sent
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "2px",
                    bgcolor: colors.green,
                  }}
                />
                <Typography sx={{ fontSize: 11, color: colors.ink3 }}>
                  Opened
                </Typography>
              </Box>
            </Box>
          </Box>
          {chartLoading ? (
            <Box
              sx={{
                height: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CircularProgress size={20} sx={{ color: colors.brand }} />
            </Box>
          ) : (
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={chartData} barGap={2} barSize={10}>
                <CartesianGrid vertical={false} stroke={colors.borderSubtle} />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtChartDate}
                  tick={{ fontSize: 10, fill: colors.ink4 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <ReTooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: colors.bgSunken }}
                />
                <Bar dataKey="sent" fill={colors.brand} radius={[3, 3, 0, 0]} />
                <Bar
                  dataKey="opened"
                  fill={colors.green}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Box>

        {/* â”€â”€ Filter bar â”€â”€ */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            mb: "12px",
            flexWrap: "wrap",
          }}
        >
          <TextField
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search company, recipient, subject, niche, locationâ€¦"
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ fontSize: 16, color: colors.ink4 }} />
                </InputAdornment>
              ),
            }}
            sx={{
              flex: 1,
              minWidth: 240,
              "& .MuiOutlinedInput-root": {
                borderRadius: "9px",
                fontSize: 13,
                bgcolor: colors.bgElev,
                "& fieldset": { borderColor: colors.border },
                "&:hover fieldset": { borderColor: colors.borderStrong },
                "&.Mui-focused fieldset": { borderColor: colors.brand },
              },
            }}
          />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              bgcolor: colors.bgElev,
              border: `1px solid ${colors.border}`,
              borderRadius: "9px",
              px: "10px",
              height: 36,
            }}
          >
            <TuneOutlined sx={{ fontSize: 14, color: colors.ink3 }} />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              size="small"
              variant="standard"
              disableUnderline
              sx={{
                fontSize: 12,
                color: colors.ink2,
                "& .MuiSelect-select": { py: 0 },
                minWidth: 80,
              }}
            >
              {STATUS_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value} sx={{ fontSize: 13 }}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </Box>
          <Select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            size="small"
            sx={{
              fontSize: 12,
              color: colors.ink2,
              bgcolor: colors.bgElev,
              border: `1px solid ${colors.border}`,
              borderRadius: "9px",
              height: 36,
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
            }}
          >
            {DATE_RANGE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value} sx={{ fontSize: 13 }}>
                Date: {o.label}
              </MenuItem>
            ))}
          </Select>
          <Select
            value={nicheFilter}
            onChange={(e) => setNicheFilter(e.target.value)}
            size="small"
            displayEmpty
            renderValue={(v) => (v ? String(v) : "Niche")}
            sx={{
              fontSize: 12,
              color: nicheFilter ? colors.ink1 : colors.ink3,
              bgcolor: colors.bgElev,
              border: `1px solid ${nicheFilter ? colors.brand : colors.border}`,
              borderRadius: "9px",
              height: 36,
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
            }}
          >
            <MenuItem value="" sx={{ fontSize: 13, color: colors.ink4 }}>
              All niches
            </MenuItem>
            {(niches as string[]).map((n) => (
              <MenuItem key={n} value={n} sx={{ fontSize: 13 }}>
                {n}
              </MenuItem>
            ))}
          </Select>
        </Box>

        {/* â”€â”€ Table â”€â”€ */}
        <Box
          sx={{
            bgcolor: colors.bgElev,
            borderRadius: "14px",
            border: `1px solid ${colors.border}`,
            overflow: "hidden",
          }}
        >
          {/* header */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "36px 1fr 1fr 1.4fr 120px 130px 110px 88px",
              alignItems: "center",
              px: "16px",
              py: "8px",
              bgcolor: colors.bgSunken,
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            {[
              "",
              "COMPANY",
              "RECIPIENT",
              "SUBJECT",
              "NICHE Â· LOC",
              "SENT",
              "ENGAGEMENT",
              "",
            ].map((h, i) => (
              <Typography
                key={i}
                sx={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: colors.ink4,
                }}
              >
                {h}
              </Typography>
            ))}
          </Box>

          {historyLoading ? (
            <Box
              sx={{
                py: "40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
              }}
            >
              <CircularProgress size={18} sx={{ color: colors.brand }} />
              <Typography fontSize={13} color={colors.ink4}>
                Loadingâ€¦
              </Typography>
            </Box>
          ) : items.length === 0 ? (
            <Box sx={{ py: "48px", textAlign: "center" }}>
              <MarkEmailRead
                sx={{ fontSize: 36, color: colors.ink4, mb: "8px" }}
              />
              <Typography fontSize={14} fontWeight={600} color={colors.ink2}>
                No emails found
              </Typography>
              <Typography fontSize={12} color={colors.ink4} mt="4px">
                {q || statusFilter !== "all" || nicheFilter
                  ? "Try clearing your filters"
                  : "Emails you send will appear here"}
              </Typography>
            </Box>
          ) : (
            (items as any[]).map((row, idx) => (
              <Box
                key={row.id}
                sx={{
                  display: "grid",
                  gridTemplateColumns:
                    "36px 1fr 1fr 1.4fr 120px 130px 110px 88px",
                  alignItems: "center",
                  px: "16px",
                  py: "11px",
                  borderBottom:
                    idx < items.length - 1
                      ? `1px solid ${colors.borderSubtle}`
                      : "none",
                  "&:hover": { bgcolor: colors.bgSunken },
                  transition: "background 0.1s",
                }}
              >
                {/* avatar */}
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "7px",
                    bgcolor: colors.brandSoft,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Typography
                    sx={{ fontSize: 10, fontWeight: 700, color: colors.brand }}
                  >
                    {initials(row.company_name || row.recipient_email)}
                  </Typography>
                </Box>

                {/* company */}
                <Box sx={{ pr: "8px", minWidth: 0 }}>
                  <Typography
                    fontSize={13}
                    fontWeight={600}
                    color={colors.ink1}
                    noWrap
                  >
                    {row.company_name || "â€”"}
                  </Typography>
                  <Typography
                    fontSize={11}
                    color={colors.ink4}
                    noWrap
                    sx={{ fontFamily: "monospace" }}
                  >
                    {row.company_domain}
                  </Typography>
                </Box>

                {/* recipient */}
                <Box sx={{ pr: "8px", minWidth: 0 }}>
                  <Typography fontSize={13} color={colors.ink1} noWrap>
                    {row.recipient_name || "â€”"}
                  </Typography>
                  <Typography
                    fontSize={11}
                    color={colors.brand}
                    noWrap
                    sx={{ fontFamily: "monospace" }}
                  >
                    {row.recipient_email}
                  </Typography>
                </Box>

                {/* subject */}
                <Typography
                  fontSize={13}
                  color={colors.ink2}
                  noWrap
                  sx={{ pr: "8px" }}
                >
                  {row.subject}
                </Typography>

                {/* niche + location */}
                <Box sx={{ pr: "8px", minWidth: 0 }}>
                  {row.niche && (
                    <Box
                      sx={{
                        display: "inline-block",
                        px: "7px",
                        py: "1px",
                        bgcolor: colors.brandSoft,
                        borderRadius: "5px",
                        mb: "2px",
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: colors.brand,
                        }}
                      >
                        {row.niche}
                      </Typography>
                    </Box>
                  )}
                  <Typography fontSize={11} color={colors.ink4} noWrap>
                    {row.location || "â€”"}
                  </Typography>
                </Box>

                {/* sent at */}
                <Typography fontSize={12} color={colors.ink3}>
                  {fmtDate(row.sent_at)}
                </Typography>

                {/* engagement */}
                <Box>
                  <EngagementBadge
                    status={row.status}
                    openCount={row.open_count}
                    repliedAt={row.replied_at}
                  />
                </Box>

                {/* actions */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: "2px",
                  }}
                >
                  <Tooltip title="Forward / Resend">
                    <IconButton
                      size="small"
                      sx={{
                        color: colors.ink4,
                        "&:hover": { color: colors.brand },
                      }}
                    >
                      <ForwardToInbox sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      sx={{
                        color: colors.ink4,
                        "&:hover": { color: colors.red },
                      }}
                      onClick={() => deleteMutation.mutate(row.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <DeleteOutline sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            ))
          )}
        </Box>

        {/* â”€â”€ Pagination â”€â”€ */}
        {totalItems > 0 && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mt: "12px",
              mb: "4px",
            }}
          >
            <Typography sx={{ fontSize: 12, color: colors.ink4 }}>
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, totalItems)}â€“
              {Math.min(page * PAGE_SIZE, totalItems)} of {totalItems} sent
              email{totalItems !== 1 ? "s" : ""}
            </Typography>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, v) => setPage(v)}
              size="small"
              siblingCount={1}
              sx={{
                "& .MuiPaginationItem-root": {
                  fontSize: 12,
                  color: colors.ink3,
                  borderColor: colors.border,
                },
                "& .Mui-selected": {
                  bgcolor: `${colors.brand} !important`,
                  color: "#fff",
                  borderColor: `${colors.brand} !important`,
                },
              }}
              variant="outlined"
              shape="rounded"
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default History;
