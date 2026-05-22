// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  Menu,
  MenuItem,
  Popover,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AddOutlined,
  BusinessOutlined,
  CheckCircle,
  ContentCopy,
  DeleteOutline,
  EmailOutlined,
  FilterListOutlined,
  ForwardToInboxOutlined,
  MoreHoriz,
  PauseCircleOutline,
  PersonAddOutlined,
  PlayCircleOutline,
  RefreshOutlined,
  SearchOutlined,
  StarBorderOutlined,
  TrendingUpOutlined,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";
import { StatCard } from "./primitives";
import { colors } from "../theme/tokens";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function avatarColor(name: string): string {
  const palette = [
    "#6b6fe3",
    "#2b7d7a",
    "#e8640c",
    "#c4423b",
    "#b97211",
    "#7a4ec2",
    "#2f8f5e",
    "#4044b9",
    "#d4762a",
    "#5b5fcf",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  free: { bg: "#f0eeea", color: colors.ink3 },
  starter: { bg: colors.tealSoft, color: colors.teal },
  professional: { bg: colors.brandSoft, color: colors.brandInk },
  enterprise: { bg: colors.violetSoft, color: colors.violet },
};

const PLAN_LABELS: Record<string, string> = {
  free: "FREE",
  starter: "STARTER",
  professional: "PRO",
  enterprise: "SCALE",
};

function PlanBadge({ plan }: { plan: string }) {
  const style = PLAN_COLORS[plan] || PLAN_COLORS.free;
  return (
    <Box
      sx={{
        display: "inline-flex",
        px: "7px",
        py: "2px",
        borderRadius: "5px",
        bgcolor: style.bg,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: style.color,
      }}
    >
      {PLAN_LABELS[plan] || plan.toUpperCase()}
    </Box>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        px: "8px",
        py: "3px",
        borderRadius: "6px",
        bgcolor: active ? "transparent" : colors.redSoft,
        fontSize: 12,
        fontWeight: 600,
        color: active ? colors.green : colors.red,
      }}
    >
      <Box
        sx={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          bgcolor: active ? colors.green : colors.red,
          flexShrink: 0,
        }}
      />
      {active ? "Active" : "Suspended"}
    </Box>
  );
}

function FilterChip({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const selected = options.find((o) => o.value === value);
  return (
    <>
      <Box
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          px: "10px",
          py: "5px",
          borderRadius: "7px",
          border: `1px solid ${colors.border}`,
          bgcolor: colors.bg,
          fontSize: 12.5,
          fontWeight: 500,
          color: colors.ink2,
          cursor: "pointer",
          "&:hover": { bgcolor: colors.bgSunken },
        }}
      >
        <FilterListOutlined sx={{ fontSize: 12 }} />
        {label} ·{" "}
        <Box component="span" sx={{ fontWeight: 700 }}>
          {selected?.label ?? value}
        </Box>
      </Box>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        {options.map((o) => (
          <MenuItem
            key={o.value}
            selected={o.value === value}
            onClick={() => {
              onChange(o.value);
              setAnchor(null);
            }}
            sx={{ fontSize: 13 }}
          >
            {o.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

// ── Change-plan popover ───────────────────────────────────────────────────────

const PLANS = [
  { value: "free", label: "Free" },
  { value: "starter", label: "Starter" },
  { value: "professional", label: "Professional (Pro)" },
  { value: "enterprise", label: "Enterprise (Scale)" },
];

function ChangePlanPopover({
  tenantId,
  currentPlan,
  onClose,
  anchorEl,
}: {
  tenantId: number;
  currentPlan: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(currentPlan);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.adminUpdatePlan(tenantId, selected),
    onSuccess: () => {
      toast.success("Plan updated");
      queryClient.invalidateQueries({ queryKey: ["adminTenants"] });
      onClose();
    },
    onError: () => toast.error("Failed to update plan"),
  });
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
    >
      <Box sx={{ p: "14px 16px", width: 210 }}>
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 700,
            color: colors.ink4,
            mb: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Change plan
        </Typography>
        {PLANS.map((p) => (
          <Box
            key={p.value}
            onClick={() => setSelected(p.value)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              p: "7px 10px",
              borderRadius: "7px",
              cursor: "pointer",
              mb: "2px",
              bgcolor: selected === p.value ? colors.brandSoft : "transparent",
              "&:hover": { bgcolor: colors.bgSunken },
            }}
          >
            <Box
              sx={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: `2px solid ${selected === p.value ? colors.brand : colors.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {selected === p.value && (
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: colors.brand,
                  }}
                />
              )}
            </Box>
            <Typography sx={{ fontSize: 13, color: colors.ink1 }}>
              {p.label}
            </Typography>
          </Box>
        ))}
        <Button
          variant="contained"
          fullWidth
          size="small"
          disabled={selected === currentPlan || mutation.isPending}
          onClick={() => mutation.mutate()}
          sx={{
            mt: "12px",
            textTransform: "none",
            fontSize: 13,
            fontWeight: 600,
            bgcolor: colors.brand,
            borderRadius: "8px",
            boxShadow: "none",
            "&:hover": { bgcolor: colors.brandInk, boxShadow: "none" },
          }}
        >
          {mutation.isPending ? (
            <CircularProgress size={12} color="inherit" />
          ) : (
            "Apply"
          )}
        </Button>
      </Box>
    </Popover>
  );
}

// ── Invite tenant dialog ──────────────────────────────────────────────────────

function InviteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ name: "", owner_email: "", plan: "free" });
  const [result, setResult] = useState<{
    name: string;
    temp_password: string | null;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.adminCreateTenant(form),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["adminTenants"] });
      queryClient.invalidateQueries({ queryKey: ["adminStats"] });
      setResult({ name: data.name, temp_password: data.temp_password });
      setStep(2);
      toast.success("Tenant created");
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || "Failed to create tenant"),
  });

  const handleClose = () => {
    setStep(1);
    setForm({ name: "", owner_email: "", plan: "free" });
    setResult(null);
    onClose();
  };

  const valid = form.name.trim() && form.owner_email.includes("@");

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: "14px" } }}
    >
      <DialogTitle sx={{ pb: "8px", pt: "20px", px: "24px" }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: colors.ink1 }}>
          {step === 1 ? "Invite tenant" : "Tenant created"}
        </Typography>
        <Typography sx={{ fontSize: 12, color: colors.ink3, mt: "2px" }}>
          {step === 1
            ? "Create a new workspace on SendMaster"
            : `${result?.name} is ready to use`}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ px: "24px", pb: "24px" }}>
        {step === 1 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              mt: "8px",
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: colors.ink4,
                  mb: "4px",
                }}
              >
                Workspace name
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. Halcyon Robotics"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "9px",
                    fontSize: 13,
                  },
                }}
              />
            </Box>
            <Box>
              <Typography
                sx={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: colors.ink4,
                  mb: "4px",
                }}
              >
                Owner email
              </Typography>
              <TextField
                fullWidth
                size="small"
                type="email"
                value={form.owner_email}
                onChange={(e) =>
                  setForm((p) => ({ ...p, owner_email: e.target.value }))
                }
                placeholder="owner@company.com"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "9px",
                    fontSize: 13,
                  },
                }}
              />
            </Box>
            <Box>
              <Typography
                sx={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: colors.ink4,
                  mb: "4px",
                }}
              >
                Plan
              </Typography>
              <Select
                fullWidth
                size="small"
                value={form.plan}
                onChange={(e) =>
                  setForm((p) => ({ ...p, plan: e.target.value }))
                }
                sx={{ borderRadius: "9px", fontSize: 13 }}
              >
                {PLANS.map((p) => (
                  <MenuItem key={p.value} value={p.value} sx={{ fontSize: 13 }}>
                    {p.label}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Button
              variant="contained"
              fullWidth
              onClick={() => mutation.mutate()}
              disabled={!valid || mutation.isPending}
              startIcon={
                mutation.isPending ? (
                  <CircularProgress size={12} color="inherit" />
                ) : (
                  <AddOutlined />
                )
              }
              sx={{
                mt: "4px",
                textTransform: "none",
                fontSize: 13,
                fontWeight: 600,
                bgcolor: colors.brand,
                borderRadius: "9px",
                boxShadow: "none",
                "&:hover": { bgcolor: colors.brandInk, boxShadow: "none" },
              }}
            >
              {mutation.isPending ? "Creating…" : "Create workspace"}
            </Button>
          </Box>
        ) : (
          <Box sx={{ mt: "8px" }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                p: "12px 14px",
                bgcolor: colors.greenSoft,
                borderRadius: "10px",
                mb: "16px",
              }}
            >
              <CheckCircle sx={{ fontSize: 18, color: colors.green }} />
              <Typography
                sx={{ fontSize: 13, fontWeight: 600, color: colors.green }}
              >
                Workspace created successfully
              </Typography>
            </Box>
            {result?.temp_password ? (
              <>
                <Typography
                  sx={{ fontSize: 12, color: colors.ink3, mb: "8px" }}
                >
                  Share this temporary password with the workspace owner. It
                  won't be shown again.
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    p: "10px 14px",
                    bgcolor: colors.bgSunken,
                    borderRadius: "9px",
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  <Typography
                    sx={{
                      flex: 1,
                      fontFamily: "monospace",
                      fontSize: 14,
                      color: colors.ink1,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {result.temp_password}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => {
                      navigator.clipboard.writeText(result.temp_password!);
                      toast.success("Copied!");
                    }}
                  >
                    <ContentCopy sx={{ fontSize: 14, color: colors.ink3 }} />
                  </IconButton>
                </Box>
              </>
            ) : (
              <Typography sx={{ fontSize: 12, color: colors.ink3 }}>
                The owner already had an account and has been assigned to this
                workspace.
              </Typography>
            )}
            <Button
              variant="outlined"
              fullWidth
              onClick={handleClose}
              sx={{
                mt: "20px",
                textTransform: "none",
                fontSize: 13,
                fontWeight: 600,
                borderColor: colors.border,
                color: colors.ink2,
                borderRadius: "9px",
              }}
            >
              Done
            </Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AdminTenantsProps {
  inviteOpen?: boolean;
  onInviteClose?: () => void;
  syncKey?: number;
}

const AdminTenants: React.FC<AdminTenantsProps> = ({
  inviteOpen = false,
  onInviteClose = () => {},
  syncKey = 0,
}) => {
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [createdRange, setCreatedRange] = useState("30d");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Context menu / popovers
  const [planAnchor, setPlanAnchor] = useState<{
    el: HTMLElement;
    id: number;
    plan: string;
  } | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{
    el: HTMLElement;
    id: number;
    active: boolean;
    is_default: boolean;
  } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, planFilter, statusFilter, createdRange]);

  // Refetch when syncKey bumps
  useEffect(() => {
    if (syncKey > 0) {
      queryClient.invalidateQueries({ queryKey: ["adminTenants"] });
      queryClient.invalidateQueries({ queryKey: ["adminStats"] });
    }
  }, [syncKey, queryClient]);

  const params = useMemo(
    () => ({
      ...(search ? { q: search } : {}),
      ...(planFilter !== "all" ? { plan: planFilter } : {}),
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      ...(createdRange !== "all" ? { created_range: createdRange } : {}),
      page,
      page_size: PAGE_SIZE,
    }),
    [search, planFilter, statusFilter, createdRange, page],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["adminTenants", params],
    queryFn: () => api.adminListTenants(params),
    staleTime: 30_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["adminStats"],
    queryFn: api.adminGetStats,
    staleTime: 60_000,
  });

  const suspendMutation = useMutation({
    mutationFn: (id: number) => api.adminSuspendTenant(id),
    onSuccess: () => {
      toast.success("Tenant suspended");
      queryClient.invalidateQueries({ queryKey: ["adminTenants"] });
    },
    onError: () => toast.error("Failed to suspend"),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: number) => api.adminReactivateTenant(id),
    onSuccess: () => {
      toast.success("Tenant reactivated");
      queryClient.invalidateQueries({ queryKey: ["adminTenants"] });
    },
    onError: () => toast.error("Failed to reactivate"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.adminDeleteTenant(id),
    onSuccess: () => {
      toast.success("Tenant deleted");
      queryClient.invalidateQueries({ queryKey: ["adminTenants"] });
      queryClient.invalidateQueries({ queryKey: ["adminStats"] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const resendInviteMutation = useMutation({
    mutationFn: (id: number) => api.adminResendInvite(id),
    onSuccess: (data) => toast.success(`Invite resent to ${data.owner_email}`),
    onError: () => toast.error("Failed to resend invite — check SMTP settings"),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;

  const allOnPageSelected =
    items.length > 0 && items.every((t) => selected.has(t.id));

  const toggleAll = () => {
    if (allOnPageSelected) {
      setSelected((s) => {
        const n = new Set(s);
        items.forEach((t) => n.delete(t.id));
        return n;
      });
    } else {
      setSelected((s) => {
        const n = new Set(s);
        items.forEach((t) => n.add(t.id));
        return n;
      });
    }
  };

  // ── Render ──

  const CELL_SX = { fontSize: 13, color: colors.ink1, py: "13px", px: "16px" };
  const HEAD_SX = {
    fontSize: 11,
    fontWeight: 700,
    color: colors.ink4,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    py: "10px",
    px: "16px",
    bgcolor: colors.bgSunken,
  };

  return (
    <Box>
      {/* ── Page header ── */}
      <Box sx={{ mb: "20px" }}>
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: colors.violet,
            mb: "4px",
          }}
        >
          Internal · Admin only
        </Typography>
        <Typography
          variant="h2"
          fontWeight={800}
          color={colors.ink1}
          lineHeight={1.15}
        >
          Tenants
        </Typography>
        <Typography sx={{ fontSize: 13, color: colors.ink3, mt: "4px" }}>
          Manage every workspace using SendMaster — change plans, suspend
          accounts, and audit usage.
        </Typography>
      </Box>

      {/* ── Stat cards ── */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "12px",
          mb: "24px",
        }}
      >
        <StatCard
          label="Total tenants"
          value={stats ? fmt(stats.total_tenants) : "—"}
          subtext={
            stats
              ? `+${Math.max(0, stats.total_tenants - stats.active_tenants)} suspended`
              : ""
          }
          icon={<BusinessOutlined />}
          tone="brand"
        />
        <StatCard
          label="Active"
          value={stats ? fmt(stats.active_tenants) : "—"}
          subtext={stats ? `${stats.suspended_tenants} suspended` : ""}
          icon={<CheckCircle />}
          tone="green"
        />
        <StatCard
          label="MRR"
          value={stats ? `$${fmt(stats.mrr)}` : "—"}
          subtext="+18% MoM"
          icon={<TrendingUpOutlined />}
          tone="violet"
        />
        <StatCard
          label="Emails (24h)"
          value={stats ? fmt(stats.emails_24h) : "—"}
          subtext="Across all tenants"
          icon={<EmailOutlined />}
          tone="teal"
        />
        <StatCard
          label="Open trials"
          value={stats ? fmt(stats.open_trials) : "—"}
          subtext="8 converting this week"
          icon={<StarBorderOutlined />}
          tone="amber"
        />
      </Box>

      {/* ── Search + filters ── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          mb: "16px",
          flexWrap: "wrap",
        }}
      >
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          placeholder="Search by tenant name, ID, owner email or domain..."
          sx={{
            flex: "1 1 260px",
            minWidth: 240,
            "& .MuiOutlinedInput-root": {
              borderRadius: "9px",
              fontSize: 13,
              bgcolor: colors.bgElev,
              "& fieldset": { borderColor: colors.border },
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined sx={{ fontSize: 14, color: colors.ink4 }} />
              </InputAdornment>
            ),
          }}
        />
        <FilterChip
          label="Plan"
          value={planFilter}
          onChange={setPlanFilter}
          options={[
            { label: "All", value: "all" },
            { label: "Free", value: "free" },
            { label: "Starter", value: "starter" },
            { label: "Pro", value: "professional" },
            { label: "Scale", value: "enterprise" },
          ]}
        />
        <FilterChip
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { label: "All", value: "all" },
            { label: "Active", value: "active" },
            { label: "Suspended", value: "suspended" },
          ]}
        />
        <FilterChip
          label="Created"
          value={createdRange}
          onChange={setCreatedRange}
          options={[
            { label: "30d", value: "30d" },
            { label: "60d", value: "60d" },
            { label: "90d", value: "90d" },
            { label: "All time", value: "all" },
          ]}
        />
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            px: "10px",
            py: "5px",
            borderRadius: "7px",
            border: `1px solid ${colors.border}`,
            bgcolor: colors.bg,
            fontSize: 12.5,
            fontWeight: 500,
            color: colors.ink3,
            cursor: "default",
          }}
        >
          Saved views
        </Box>
      </Box>

      {/* ── Table ── */}
      <Box
        sx={{
          bgcolor: colors.bgElev,
          border: `1px solid ${colors.border}`,
          borderRadius: "12px",
          overflow: "hidden",
          mb: "12px",
        }}
      >
        {isLoading && (
          <LinearProgress
            sx={{
              bgcolor: colors.brandSoft,
              "& .MuiLinearProgress-bar": { bgcolor: colors.brand },
            }}
          />
        )}

        {/* Header */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns:
              "36px 2fr 70px 100px 110px 90px 100px 90px 1fr",
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <Box sx={{ ...HEAD_SX, display: "flex", alignItems: "center" }}>
            <Checkbox
              size="small"
              checked={allOnPageSelected}
              indeterminate={selected.size > 0 && !allOnPageSelected}
              onChange={toggleAll}
              sx={{ p: 0, color: colors.ink4 }}
            />
          </Box>
          {[
            "Tenant",
            "Users",
            "Status",
            "Created",
            "Plan",
            "Emails (mo)",
            "Leads",
            "",
          ].map((h) => (
            <Box key={h} sx={HEAD_SX}>
              {h}
            </Box>
          ))}
        </Box>

        {/* Rows */}
        {items.length === 0 && !isLoading && (
          <Box sx={{ py: "40px", textAlign: "center" }}>
            <Typography sx={{ fontSize: 13, color: colors.ink4 }}>
              No tenants match your filters
            </Typography>
          </Box>
        )}

        {items.map((t, idx) => {
          const bg = avatarColor(t.name);
          const initials = nameInitials(t.name);
          const isSelected = selected.has(t.id);
          const idStr = "#" + String(t.id).padStart(4, "0");
          return (
            <Box
              key={t.id}
              sx={{
                display: "grid",
                gridTemplateColumns:
                  "36px 2fr 70px 100px 110px 90px 100px 90px 1fr",
                borderBottom:
                  idx < items.length - 1
                    ? `1px solid ${colors.borderSubtle}`
                    : "none",
                bgcolor: isSelected ? colors.brandSoft : "transparent",
                "&:hover": {
                  bgcolor: isSelected ? colors.brandSoft : colors.bgSunken,
                },
              }}
            >
              {/* Checkbox */}
              <Box sx={{ ...CELL_SX, display: "flex", alignItems: "center" }}>
                <Checkbox
                  size="small"
                  checked={isSelected}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      isSelected ? n.delete(t.id) : n.add(t.id);
                      return n;
                    })
                  }
                  sx={{ p: 0, color: colors.ink4 }}
                />
              </Box>

              {/* Tenant */}
              <Box
                sx={{
                  ...CELL_SX,
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: "8px",
                    bgcolor: bg,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </Box>
                <Box>
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: colors.ink1,
                        lineHeight: 1.2,
                      }}
                    >
                      {t.name}
                    </Typography>
                    {t.is_default && (
                      <Box
                        sx={{
                          px: "5px",
                          py: "1px",
                          bgcolor: colors.brandSoft,
                          borderRadius: "4px",
                          fontSize: 10,
                          fontWeight: 700,
                          color: colors.brandInk,
                          lineHeight: 1.4,
                        }}
                      >
                        DEFAULT
                      </Box>
                    )}
                  </Box>
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: colors.ink4,
                      fontFamily: "monospace",
                    }}
                  >
                    {idStr}
                  </Typography>
                </Box>
              </Box>

              {/* Users */}
              <Box sx={{ ...CELL_SX, color: colors.ink3 }}>
                <Typography sx={{ fontSize: 13 }}>A {t.user_count}</Typography>
              </Box>

              {/* Status */}
              <Box sx={{ ...CELL_SX }}>
                <StatusBadge active={t.is_active} />
              </Box>

              {/* Created */}
              <Box sx={{ ...CELL_SX, color: colors.ink3, fontSize: 12 }}>
                {t.created_at}
              </Box>

              {/* Plan */}
              <Box sx={{ ...CELL_SX }}>
                <PlanBadge plan={t.plan} />
              </Box>

              {/* Emails (mo) */}
              <Box sx={{ ...CELL_SX, color: colors.ink2, fontSize: 12 }}>
                {fmt(t.emails_this_month)}
              </Box>

              {/* Leads */}
              <Box sx={{ ...CELL_SX, color: colors.ink2, fontSize: 12 }}>
                {fmt(t.leads_count)}
              </Box>

              {/* Actions */}
              <Box
                sx={{
                  ...CELL_SX,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Button
                  variant="outlined"
                  size="small"
                  onClick={(e) =>
                    setPlanAnchor({
                      el: e.currentTarget,
                      id: t.id,
                      plan: t.plan,
                    })
                  }
                  sx={{
                    textTransform: "none",
                    fontSize: 12,
                    fontWeight: 600,
                    borderColor: colors.border,
                    color: colors.ink2,
                    borderRadius: "7px",
                    py: "3px",
                    px: "10px",
                    "&:hover": {
                      borderColor: colors.borderStrong,
                      bgcolor: colors.bgSunken,
                    },
                  }}
                >
                  Change plan ↓
                </Button>
                <IconButton
                  size="small"
                  onClick={(e) =>
                    setMenuAnchor({
                      el: e.currentTarget,
                      id: t.id,
                      active: t.is_active,
                      is_default: t.is_default ?? false,
                    })
                  }
                  sx={{ color: colors.ink3 }}
                >
                  <MoreHoriz sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* ── Pagination ── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: "4px",
        }}
      >
        <Typography sx={{ fontSize: 12, color: colors.ink4 }}>
          Showing {items.length} of {fmt(total)} tenants
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Button
            size="small"
            variant="outlined"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            sx={{
              textTransform: "none",
              fontSize: 12,
              borderColor: colors.border,
              color: colors.ink2,
              borderRadius: "7px",
              minWidth: 52,
            }}
          >
            ‹ Prev
          </Button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const n = i + 1;
            return (
              <Button
                key={n}
                size="small"
                variant={page === n ? "contained" : "outlined"}
                onClick={() => setPage(n)}
                sx={{
                  textTransform: "none",
                  fontSize: 12,
                  minWidth: 36,
                  borderColor: colors.border,
                  bgcolor: page === n ? colors.brand : "transparent",
                  color: page === n ? "#fff" : colors.ink2,
                  borderRadius: "7px",
                  boxShadow: "none",
                  "&:hover": {
                    boxShadow: "none",
                    bgcolor: page === n ? colors.brandInk : colors.bgSunken,
                  },
                }}
              >
                {n}
              </Button>
            );
          })}
          <Button
            size="small"
            variant="outlined"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            sx={{
              textTransform: "none",
              fontSize: 12,
              borderColor: colors.border,
              color: colors.ink2,
              borderRadius: "7px",
              minWidth: 52,
            }}
          >
            Next ›
          </Button>
        </Box>
      </Box>

      {/* ── Change plan popover ── */}
      {planAnchor && (
        <ChangePlanPopover
          anchorEl={planAnchor.el}
          tenantId={planAnchor.id}
          currentPlan={planAnchor.plan}
          onClose={() => setPlanAnchor(null)}
        />
      )}

      {/* ── Row context menu ── */}
      <Menu
        anchorEl={menuAnchor?.el ?? null}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        {menuAnchor?.active ? (
          <MenuItem
            onClick={() => {
              suspendMutation.mutate(menuAnchor.id);
              setMenuAnchor(null);
            }}
            disabled={menuAnchor?.is_default}
            sx={{
              fontSize: 13,
              color: menuAnchor?.is_default ? undefined : colors.amber,
              gap: "8px",
            }}
          >
            <PauseCircleOutline sx={{ fontSize: 15 }} /> Suspend
          </MenuItem>
        ) : (
          <MenuItem
            onClick={() => {
              reactivateMutation.mutate(menuAnchor.id);
              setMenuAnchor(null);
            }}
            sx={{ fontSize: 13, color: colors.green, gap: "8px" }}
          >
            <PlayCircleOutline sx={{ fontSize: 15 }} /> Reactivate
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            resendInviteMutation.mutate(menuAnchor.id);
            setMenuAnchor(null);
          }}
          sx={{ fontSize: 13, color: colors.brand, gap: "8px" }}
        >
          <ForwardToInboxOutlined sx={{ fontSize: 15 }} /> Resend invite
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            if (window.confirm("Delete this tenant? This cannot be undone.")) {
              deleteMutation.mutate(menuAnchor.id);
            }
            setMenuAnchor(null);
          }}
          disabled={menuAnchor?.is_default}
          sx={{
            fontSize: 13,
            color: menuAnchor?.is_default ? undefined : colors.red,
            gap: "8px",
          }}
        >
          <DeleteOutline sx={{ fontSize: 15 }} /> Delete
        </MenuItem>
      </Menu>

      {/* ── Invite dialog ── */}
      <InviteDialog open={inviteOpen} onClose={onInviteClose} />
    </Box>
  );
};

export default AdminTenants;
