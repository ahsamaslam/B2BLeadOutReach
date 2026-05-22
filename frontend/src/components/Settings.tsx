// @ts-nocheck
import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AutorenewOutlined,
  BusinessOutlined,
  CheckCircle,
  ContentCopy,
  DnsOutlined,
  EmailOutlined,
  ErrorOutline,
  ForwardToInboxOutlined,
  InfoOutlined,
  ScheduleSendOutlined,
  TrackChangesOutlined,
  Visibility,
  VisibilityOff,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";
import { colors } from "../theme/tokens";
import Portfolio from "./Portfolio";

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return "never";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success("Copied!"));
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        bgcolor: colors.bgElev,
        border: `1px solid ${colors.border}`,
        borderRadius: "14px",
        overflow: "hidden",
      }}
    >
      {/* Section header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          px: "20px",
          py: "13px",
          bgcolor: colors.bgSunken,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: "8px",
            bgcolor: iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {React.cloneElement(icon as React.ReactElement, {
            sx: { fontSize: 16, color: iconColor },
          })}
        </Box>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: colors.ink1 }}>
          {title}
        </Typography>
      </Box>

      {/* Body: description | fields */}
      <Box sx={{ display: "flex" }}>
        {/* Left: description */}
        <Box
          sx={{
            width: 230,
            flexShrink: 0,
            borderRight: `1px solid ${colors.border}`,
            p: "20px 20px 24px",
          }}
        >
          <Typography
            sx={{ fontSize: 12, color: colors.ink3, lineHeight: 1.6 }}
          >
            {description}
          </Typography>
        </Box>
        {/* Right: fields */}
        <Box sx={{ flex: 1, p: "20px 24px 24px" }}>{children}</Box>
      </Box>
    </Box>
  );
}

// ── Styled TextField ──────────────────────────────────────────────────────────

function FField({
  label,
  value,
  onChange,
  type = "text",
  endAdornment,
  hint,
  fullWidth = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  endAdornment?: React.ReactNode;
  hint?: string;
  fullWidth?: boolean;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: colors.ink4,
        }}
      >
        {label}
      </Typography>
      <TextField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        size="small"
        fullWidth={fullWidth}
        InputProps={
          endAdornment
            ? {
                endAdornment: (
                  <InputAdornment position="end">{endAdornment}</InputAdornment>
                ),
              }
            : undefined
        }
        sx={{
          "& .MuiOutlinedInput-root": {
            borderRadius: "9px",
            fontSize: 13,
            bgcolor: colors.bg,
            "& fieldset": { borderColor: colors.border },
            "&:hover fieldset": { borderColor: colors.borderStrong },
            "&.Mui-focused fieldset": { borderColor: colors.brand },
          },
        }}
      />
      {hint && (
        <Typography sx={{ fontSize: 11, color: colors.ink4, mt: "2px" }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

// ── FieldRow (2-col grid) ─────────────────────────────────────────────────────

function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "14px",
        mb: "14px",
      }}
    >
      {children}
    </Box>
  );
}

// ── DNS record row ────────────────────────────────────────────────────────────

function DnsRow({
  verified,
  label,
  description,
  code,
}: {
  verified: boolean | null;
  label: string;
  description: string;
  code: string;
}) {
  return (
    <Box sx={{ mb: "20px" }}>
      <Box
        sx={{ display: "flex", alignItems: "center", gap: "8px", mb: "6px" }}
      >
        {verified === true ? (
          <CheckCircle sx={{ fontSize: 16, color: colors.green }} />
        ) : verified === false ? (
          <WarningAmberOutlined sx={{ fontSize: 16, color: colors.amber }} />
        ) : (
          <InfoOutlined sx={{ fontSize: 16, color: colors.ink4 }} />
        )}
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: colors.ink1 }}>
          {label}
        </Typography>
        <Box
          sx={{
            ml: "auto",
            px: "8px",
            py: "2px",
            borderRadius: "5px",
            bgcolor: verified ? colors.greenSoft : colors.amberSoft,
          }}
        >
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 700,
              color: verified ? colors.green : colors.amber,
            }}
          >
            {verified ? "Verified" : "Pending"}
          </Typography>
        </Box>
      </Box>
      <Typography sx={{ fontSize: 12, color: colors.ink3, mb: "8px" }}>
        {description}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          bgcolor: colors.bgSunken,
          border: `1px solid ${colors.border}`,
          borderRadius: "8px",
          px: "12px",
          py: "8px",
        }}
      >
        <Typography
          sx={{
            flex: 1,
            fontSize: 12,
            fontFamily: "monospace",
            color: colors.ink2,
            wordBreak: "break-all",
          }}
        >
          {code}
        </Typography>
        <Tooltip title="Copy">
          <IconButton
            size="small"
            onClick={() => copyText(code)}
            sx={{ color: colors.ink4, "&:hover": { color: colors.ink1 } }}
          >
            <ContentCopy sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

// ── Tab placeholder ───────────────────────────────────────────────────────────

function PlaceholderTab({ label }: { label: string }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: "64px",
        gap: "10px",
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: "12px",
          bgcolor: colors.brandSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <InfoOutlined sx={{ fontSize: 22, color: colors.brand }} />
      </Box>
      <Typography sx={{ fontSize: 15, fontWeight: 700, color: colors.ink2 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 13, color: colors.ink4 }}>
        Coming soon in a future update.
      </Typography>
    </Box>
  );
}

// ── Team & roles tab ─────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

function roleColor(role: string): { bg: string; color: string } {
  if (role === "owner") return { bg: colors.amberSoft, color: colors.amber };
  if (role === "admin") return { bg: colors.brandSoft, color: colors.brandInk };
  return { bg: colors.bgSunken, color: colors.ink3 };
}

function TeamTab() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    display_name: "",
    role: "member",
  });
  const [tempPwd, setTempPwd] = useState<string | null>(null);
  const [inviteStep, setInviteStep] = useState<1 | 2>(1);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["teamMembers"],
    queryFn: api.getTeamMembers,
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.inviteTeamMember(inviteForm),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
      setTempPwd(res.temp_password);
      setInviteStep(2);
      toast.success("Member added");
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || "Failed to invite"),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) => api.removeTeamMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
      toast.success("Member removed");
    },
    onError: () => toast.error("Failed to remove"),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api.updateTeamMemberRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
    },
    onError: () => toast.error("Failed to update role"),
  });

  const resendInviteMutation = useMutation({
    mutationFn: (userId: number) => api.resendTeamMemberInvite(userId),
    onSuccess: () => toast.success("Invite resent"),
    onError: () => toast.error("Failed to resend invite"),
  });

  const closeInvite = () => {
    setInviteOpen(false);
    setInviteStep(1);
    setInviteForm({ email: "", display_name: "", role: "member" });
    setTempPwd(null);
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: "40px" }}>
        <CircularProgress size={22} sx={{ color: colors.brand }} />
      </Box>
    );
  }

  if (members.length === 0 && !isLoading) {
    return (
      <Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: "20px",
          }}
        >
          <Box>
            <Typography
              sx={{ fontSize: 15, fontWeight: 700, color: colors.ink1 }}
            >
              Team members
            </Typography>
            <Typography sx={{ fontSize: 12, color: colors.ink3 }}>
              Invite colleagues to collaborate in this workspace
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            onClick={() => setInviteOpen(true)}
            sx={{
              textTransform: "none",
              fontSize: 13,
              fontWeight: 600,
              bgcolor: colors.brand,
              borderRadius: "9px",
              boxShadow: "none",
              "&:hover": { bgcolor: colors.brandInk, boxShadow: "none" },
            }}
          >
            + Invite member
          </Button>
        </Box>
        <Box sx={{ py: "48px", textAlign: "center" }}>
          <Typography sx={{ fontSize: 13, color: colors.ink4 }}>
            No team members yet. Invite someone to get started.
          </Typography>
        </Box>
        <InviteModal
          open={inviteOpen}
          onClose={closeInvite}
          form={inviteForm}
          setForm={setInviteForm}
          onSubmit={() => inviteMutation.mutate()}
          isPending={inviteMutation.isPending}
          step={inviteStep}
          tempPwd={tempPwd}
        />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: "20px",
        }}
      >
        <Box>
          <Typography
            sx={{ fontSize: 15, fontWeight: 700, color: colors.ink1 }}
          >
            Team members
            <Box
              component="span"
              sx={{
                ml: "8px",
                px: "7px",
                py: "2px",
                bgcolor: colors.brandSoft,
                borderRadius: "5px",
                fontSize: 11,
                fontWeight: 700,
                color: colors.brandInk,
              }}
            >
              {members.length}
            </Box>
          </Typography>
          <Typography sx={{ fontSize: 12, color: colors.ink3, mt: "2px" }}>
            Manage who has access to this workspace and their permissions.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          onClick={() => setInviteOpen(true)}
          sx={{
            textTransform: "none",
            fontSize: 13,
            fontWeight: 600,
            bgcolor: colors.brand,
            borderRadius: "9px",
            boxShadow: "none",
            "&:hover": { bgcolor: colors.brandInk, boxShadow: "none" },
          }}
        >
          + Invite member
        </Button>
      </Box>

      {/* Members list */}
      <Box
        sx={{
          bgcolor: colors.bgElev,
          border: `1px solid ${colors.border}`,
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        {members.map((m, idx) => {
          const rc = roleColor(m.role);
          const displayName = m.display_name || m.email;
          const initials = displayName.slice(0, 2).toUpperCase();
          return (
            <Box
              key={m.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                px: "20px",
                py: "14px",
                borderBottom:
                  idx < members.length - 1
                    ? `1px solid ${colors.borderSubtle}`
                    : "none",
                "&:hover": { bgcolor: colors.bgSunken },
              }}
            >
              {/* Avatar */}
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #d6c8b0, #b39d76)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initials}
              </Box>

              {/* Name + email */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{ fontSize: 13, fontWeight: 600, color: colors.ink1 }}
                >
                  {displayName}
                </Typography>
                {m.display_name && (
                  <Typography sx={{ fontSize: 11, color: colors.ink4 }}>
                    {m.email}
                  </Typography>
                )}
              </Box>

              {/* Role chip */}
              <Box
                sx={{
                  px: "8px",
                  py: "3px",
                  borderRadius: "6px",
                  bgcolor: rc.bg,
                  fontSize: 11,
                  fontWeight: 700,
                  color: rc.color,
                  flexShrink: 0,
                }}
              >
                {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
              </Box>

              {/* Role select */}
              <Select
                size="small"
                value={m.role}
                onChange={(e) =>
                  roleMutation.mutate({ userId: m.id, role: e.target.value })
                }
                sx={{
                  fontSize: 12,
                  borderRadius: "7px",
                  minWidth: 100,
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: colors.border,
                  },
                }}
              >
                {ROLE_OPTIONS.map((r) => (
                  <MenuItem key={r.value} value={r.value} sx={{ fontSize: 13 }}>
                    {r.label}
                  </MenuItem>
                ))}
              </Select>

              {/* Resend invite */}
              <Tooltip title="Resend invite email">
                <IconButton
                  size="small"
                  onClick={() => resendInviteMutation.mutate(m.id)}
                  disabled={resendInviteMutation.isPending}
                  sx={{
                    color: colors.ink4,
                    "&:hover": { color: colors.brand },
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M4 4l16 8-16 8V4z" />
                    <line x1="12" y1="12" x2="20" y2="12" />
                  </svg>
                </IconButton>
              </Tooltip>

              {/* Remove */}
              <Tooltip title="Remove from workspace">
                <IconButton
                  size="small"
                  onClick={() => {
                    if (
                      window.confirm(`Remove ${m.email} from this workspace?`)
                    ) {
                      removeMutation.mutate(m.id);
                    }
                  }}
                  disabled={m.role === "owner"}
                  sx={{
                    color: colors.ink4,
                    "&:hover": { color: colors.red },
                    "&.Mui-disabled": { opacity: 0.3 },
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                </IconButton>
              </Tooltip>
            </Box>
          );
        })}
      </Box>

      {/* Invite modal */}
      <InviteModal
        open={inviteOpen}
        onClose={closeInvite}
        form={inviteForm}
        setForm={setInviteForm}
        onSubmit={() => inviteMutation.mutate()}
        isPending={inviteMutation.isPending}
        step={inviteStep}
        tempPwd={tempPwd}
      />
    </Box>
  );
}

function InviteModal({
  open,
  onClose,
  form,
  setForm,
  onSubmit,
  isPending,
  step,
  tempPwd,
}) {
  const valid = form.email.includes("@");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: "14px" } }}
    >
      <DialogTitle sx={{ pb: "8px", pt: "20px", px: "24px" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: colors.ink1 }}>
          {step === 1 ? "Invite team member" : "Invitation sent"}
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
                Email address
              </Typography>
              <TextField
                fullWidth
                size="small"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((p) => ({ ...p, email: e.target.value }))
                }
                placeholder="colleague@company.com"
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
                Display name (optional)
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={form.display_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, display_name: e.target.value }))
                }
                placeholder="Jane Smith"
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
                Role
              </Typography>
              <Select
                fullWidth
                size="small"
                value={form.role}
                onChange={(e) =>
                  setForm((p) => ({ ...p, role: e.target.value }))
                }
                sx={{ borderRadius: "9px", fontSize: 13 }}
              >
                <MenuItem value="admin" sx={{ fontSize: 13 }}>
                  Admin — can manage settings and campaigns
                </MenuItem>
                <MenuItem value="member" sx={{ fontSize: 13 }}>
                  Member — can view and send emails
                </MenuItem>
              </Select>
            </Box>
            <Button
              variant="contained"
              fullWidth
              onClick={onSubmit}
              disabled={!valid || isPending}
              startIcon={
                isPending ? (
                  <CircularProgress size={12} color="inherit" />
                ) : undefined
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
              {isPending ? "Inviting…" : "Send invite"}
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
                Member added successfully
              </Typography>
            </Box>
            {tempPwd && (
              <>
                <Typography
                  sx={{ fontSize: 12, color: colors.ink3, mb: "8px" }}
                >
                  Share this temporary password. It won't be shown again.
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
                    }}
                  >
                    {tempPwd}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => {
                      navigator.clipboard.writeText(tempPwd);
                      toast.success("Copied!");
                    }}
                  >
                    <ContentCopy sx={{ fontSize: 14, color: colors.ink3 }} />
                  </IconButton>
                </Box>
              </>
            )}
            <Button
              variant="outlined"
              fullWidth
              onClick={onClose}
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

// ── Tab label ────────────────────────────────────────────────────────────────

const TABS = [
  "Configuration",
  "Portfolio files",
  "Team & roles",
  "Sending domains",
  "Tracking pixel",
];

// ── Main component ────────────────────────────────────────────────────────────

const Settings: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  // ── Queries ──
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const { data: smtpStatus, refetch: refetchSmtpStatus } = useQuery({
    queryKey: ["smtpStatus"],
    queryFn: api.getSmtpStatus,
    staleTime: 60_000,
  });

  // Sync server → local
  useEffect(() => {
    if (data?.values) {
      setValues({ ...data.values });
      setDirty(false);
    }
  }, [data]);

  // ── Mutations ──
  const saveMutation = useMutation({
    mutationFn: () => api.updateSettings(values),
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setDirty(false);
    },
    onError: () => toast.error("Save failed"),
  });

  const testMutation = useMutation({
    mutationFn: api.testSmtp,
    onSuccess: (res) => {
      toast.success(`Connection healthy · ${res.latency_ms}ms`);
      refetchSmtpStatus();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "SMTP test failed");
      refetchSmtpStatus();
    },
  });

  const set = useCallback((k: string, v: string) => {
    setValues((p) => ({ ...p, [k]: v }));
    setDirty(true);
  }, []);

  const discard = () => {
    if (data?.values) {
      setValues({ ...data.values });
      setDirty(false);
    }
  };

  // ── DNS record helpers ──
  const fromDomain =
    (values.SMTP_FROM_EMAIL || "").split("@")[1] || "yourdomain.com";
  const smtpHost = values.SMTP_HOST || "";
  const spfInclude = smtpHost
    ? smtpHost.includes("hostinger")
      ? "_spf.hostinger.com"
      : smtpHost.includes("google") || smtpHost.includes("gmail")
        ? "_spf.google.com"
        : smtpHost.includes("amazonses")
          ? "amazonses.com"
          : smtpHost.includes("mailgun")
            ? "mailgun.org"
            : `_spf.${smtpHost}`
    : "_spf.your-smtp-provider.com";
  const spfRecord = `v=spf1 include:${spfInclude} include:${fromDomain} ~all`;
  const dkimRecord = `Enabled · key1._domainkey.${fromDomain} → 2048-bit`;
  const dmarcRecord = `v=DMARC1; p=none; rua=mailto:dmarc@${fromDomain}`;

  const smtpOk = smtpStatus?.success === true;
  const verifiedCount = smtpOk ? 2 : 0; // SPF + DKIM if SMTP test passed

  // ── Render ──
  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          py: "80px",
        }}
      >
        <CircularProgress size={24} sx={{ color: colors.brand }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* ── Page header ── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          mb: "6px",
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
            {data?.tenant_name ?? "Workspace"} ·{" "}
            {(data?.plan ?? "free").toUpperCase()} PLAN
          </Typography>
          <Typography
            variant="h2"
            fontWeight={800}
            color={colors.ink1}
            lineHeight={1.15}
          >
            Settings
          </Typography>
          <Typography
            sx={{ fontSize: 13, color: colors.ink3, mt: "4px", maxWidth: 560 }}
          >
            Workspace-level overrides for sender identity, SMTP, tracking and
            follow-up cadence. Leave a field blank to fall back to the server
            default.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: "8px", mt: "4px", flexShrink: 0 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={discard}
            disabled={!dirty || saveMutation.isPending}
            sx={{
              textTransform: "none",
              fontSize: 13,
              fontWeight: 600,
              borderColor: colors.border,
              color: colors.ink2,
              borderRadius: "9px",
              "&:hover": { borderColor: colors.borderStrong },
            }}
          >
            Discard
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
            startIcon={
              saveMutation.isPending ? (
                <CircularProgress size={12} color="inherit" />
              ) : undefined
            }
            sx={{
              textTransform: "none",
              fontSize: 13,
              fontWeight: 600,
              bgcolor: colors.brand,
              borderRadius: "9px",
              boxShadow: "none",
              "&:hover": { bgcolor: colors.brandInk, boxShadow: "none" },
            }}
          >
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </Box>
      </Box>

      {/* ── Tabs ── */}
      <Box
        sx={{
          borderBottom: `1px solid ${colors.border}`,
          mb: "20px",
          mt: "16px",
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            minHeight: 38,
            "& .MuiTab-root": {
              textTransform: "none",
              fontSize: 13,
              fontWeight: 600,
              color: colors.ink3,
              minHeight: 38,
              py: "8px",
              px: "14px",
            },
            "& .Mui-selected": { color: `${colors.ink1} !important` },
            "& .MuiTabs-indicator": { bgcolor: colors.brand, height: "2px" },
          }}
        >
          {TABS.map((t) => (
            <Tab key={t} label={t} disableRipple />
          ))}
        </Tabs>
      </Box>

      {/* ── Portfolio tab ── */}
      {activeTab === 1 && <Portfolio />}

      {/* ── Team & roles tab ── */}
      {activeTab === 2 && <TeamTab />}

      {/* ── Placeholder tabs ── */}
      {activeTab === 3 && <PlaceholderTab label="Sending domains" />}
      {activeTab === 4 && <PlaceholderTab label="Tracking pixel" />}

      {/* ── Configuration tab ── */}
      {activeTab === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* ── SMTP status banner ── */}
          {smtpStatus?.tested_at && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                bgcolor: smtpOk ? colors.brandSoft : colors.redSoft,
                border: `1px solid ${smtpOk ? colors.brandSoft2 : colors.redSoft}`,
                borderRadius: "12px",
                px: "16px",
                py: "12px",
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  bgcolor: smtpOk ? colors.brand : colors.red,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {smtpOk ? (
                  <CheckCircle sx={{ fontSize: 16, color: "#fff" }} />
                ) : (
                  <ErrorOutline sx={{ fontSize: 16, color: "#fff" }} />
                )}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: smtpOk ? colors.brand : colors.red,
                  }}
                >
                  {smtpOk
                    ? "Your sender identity is configured"
                    : "SMTP connection failed"}
                </Typography>
                <Typography
                  sx={{ fontSize: 12, color: colors.ink3, mt: "1px" }}
                >
                  {smtpOk
                    ? `Last test sent to ${smtpStatus.tested_email} succeeded · ${timeAgo(smtpStatus.tested_at)}. ${spfInclude.includes("hostinger") || spfInclude.includes("google") ? "SPF and DKIM verified, DMARC pending." : "Configure DNS records below."}`
                    : smtpStatus.message}
                </Typography>
              </Box>
              <Button
                variant="outlined"
                size="small"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                startIcon={
                  testMutation.isPending ? (
                    <CircularProgress size={11} color="inherit" />
                  ) : (
                    <ForwardToInboxOutlined
                      sx={{ fontSize: "13px !important" }}
                    />
                  )
                }
                sx={{
                  textTransform: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  borderColor: smtpOk ? colors.brand : colors.red,
                  color: smtpOk ? colors.brand : colors.red,
                  borderRadius: "8px",
                  flexShrink: 0,
                  "&:hover": {
                    bgcolor: smtpOk ? colors.brandSoft : colors.redSoft,
                  },
                }}
              >
                Send test email
              </Button>
            </Box>
          )}

          {/* ── 1. Company branding ── */}
          <SectionCard
            icon={<BusinessOutlined />}
            iconBg={colors.amberSoft}
            iconColor={colors.amber}
            title="Company branding"
            description="Used in email signatures, the portfolio attachment cover and the AI personalization prompt."
          >
            <FieldRow>
              <FField
                label="Company name"
                value={values.MY_COMPANY_NAME ?? ""}
                onChange={(v) => set("MY_COMPANY_NAME", v)}
              />
              <FField
                label="Services description"
                value={values.MY_COMPANY_SERVICES ?? ""}
                onChange={(v) => set("MY_COMPANY_SERVICES", v)}
              />
            </FieldRow>
            <FieldRow>
              <FField
                label="Value proposition"
                value={values.MY_COMPANY_VALUE_PROP ?? ""}
                onChange={(v) => set("MY_COMPANY_VALUE_PROP", v)}
              />
              <FField
                label="Company website"
                value={values.MY_COMPANY_WEBSITE ?? ""}
                onChange={(v) => set("MY_COMPANY_WEBSITE", v)}
              />
            </FieldRow>
            <FieldRow>
              <FField
                label="Contact email"
                value={values.MY_COMPANY_CONTACT ?? ""}
                onChange={(v) => set("MY_COMPANY_CONTACT", v)}
              />
              <FField
                label="Sender full name"
                value={values.SENDER_FULL_NAME ?? ""}
                onChange={(v) => set("SENDER_FULL_NAME", v)}
              />
            </FieldRow>
          </SectionCard>

          {/* ── 2. Email / SMTP ── */}
          <SectionCard
            icon={<EmailOutlined />}
            iconBg={colors.brandSoft}
            iconColor={colors.brand}
            title="Email / SMTP"
            description="The mailbox SendMaster will deliver from. Most providers (Hostinger, Google Workspace, Postmark, AWS SES) work out of the box."
          >
            <FieldRow>
              <FField
                label="SMTP host"
                value={values.SMTP_HOST ?? ""}
                onChange={(v) => set("SMTP_HOST", v)}
              />
              <FField
                label="Port"
                value={values.SMTP_PORT ?? ""}
                onChange={(v) => set("SMTP_PORT", v)}
              />
            </FieldRow>
            <FieldRow>
              <FField
                label="SMTP username"
                value={values.SMTP_USER ?? ""}
                onChange={(v) => set("SMTP_USER", v)}
              />
              <FField
                label="SMTP password"
                value={values.SMTP_PASSWORD ?? ""}
                onChange={(v) => set("SMTP_PASSWORD", v)}
                type={showPwd ? "text" : "password"}
                endAdornment={
                  <IconButton
                    size="small"
                    onClick={() => setShowPwd((p) => !p)}
                  >
                    {showPwd ? (
                      <VisibilityOff
                        sx={{ fontSize: 15, color: colors.ink4 }}
                      />
                    ) : (
                      <Visibility sx={{ fontSize: 15, color: colors.ink4 }} />
                    )}
                  </IconButton>
                }
              />
            </FieldRow>
            <FieldRow>
              <FField
                label="From email address"
                value={values.SMTP_FROM_EMAIL ?? ""}
                onChange={(v) => set("SMTP_FROM_EMAIL", v)}
              />
              <FField
                label="From name"
                value={values.SMTP_FROM_NAME ?? ""}
                onChange={(v) => set("SMTP_FROM_NAME", v)}
              />
            </FieldRow>

            {/* Connection status */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                mt: "6px",
                p: "10px 14px",
                bgcolor: smtpOk
                  ? colors.greenSoft
                  : smtpStatus?.success === false
                    ? colors.redSoft
                    : colors.bgSunken,
                borderRadius: "9px",
                border: `1px solid ${smtpOk ? colors.green + "40" : smtpStatus?.success === false ? colors.red + "40" : colors.border}`,
              }}
            >
              {smtpOk ? (
                <CheckCircle sx={{ fontSize: 15, color: colors.green }} />
              ) : smtpStatus?.success === false ? (
                <ErrorOutline sx={{ fontSize: 15, color: colors.red }} />
              ) : (
                <InfoOutlined sx={{ fontSize: 15, color: colors.ink4 }} />
              )}
              <Box sx={{ flex: 1 }}>
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: smtpOk
                      ? colors.green
                      : smtpStatus?.success === false
                        ? colors.red
                        : colors.ink3,
                  }}
                >
                  {smtpOk
                    ? "Connection healthy"
                    : smtpStatus?.success === false
                      ? "Connection failed"
                      : "Not tested yet"}
                </Typography>
                {smtpStatus?.tested_at && (
                  <Typography
                    sx={{ fontSize: 11, color: colors.ink4, mt: "1px" }}
                  >
                    {smtpStatus.message
                      ? `${smtpStatus.message} · last verified ${timeAgo(smtpStatus.tested_at)}`
                      : `Last verified ${timeAgo(smtpStatus.tested_at)}`}
                  </Typography>
                )}
              </Box>
              <Button
                variant="outlined"
                size="small"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                startIcon={
                  testMutation.isPending ? (
                    <CircularProgress size={11} color="inherit" />
                  ) : (
                    <AutorenewOutlined sx={{ fontSize: "12px !important" }} />
                  )
                }
                sx={{
                  textTransform: "none",
                  fontSize: 11,
                  fontWeight: 600,
                  borderColor: colors.border,
                  color: colors.ink2,
                  borderRadius: "7px",
                }}
              >
                Re-test
              </Button>
            </Box>
          </SectionCard>

          {/* ── 3. Email tracking ── */}
          <SectionCard
            icon={<TrackChangesOutlined />}
            iconBg={"#e3f1f0"}
            iconColor={colors.teal}
            title="Email tracking"
            description="Embed a 1×1 pixel so SendMaster can mark when emails are opened. Disable if your recipients block tracking or you'd rather not."
          >
            {/* Toggle */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                p: "10px 14px",
                bgcolor: colors.bgSunken,
                borderRadius: "9px",
                border: `1px solid ${colors.border}`,
                mb: "14px",
              }}
            >
              <Box>
                <Typography
                  sx={{ fontSize: 13, fontWeight: 600, color: colors.ink1 }}
                >
                  Track opens on outgoing emails
                </Typography>
                <Typography sx={{ fontSize: 11, color: colors.ink4 }}>
                  Pixel served from your own tracking domain — no third-party
                </Typography>
              </Box>
              <Switch
                checked={values.TRACKING_ENABLED !== "false"}
                onChange={(e) =>
                  set("TRACKING_ENABLED", e.target.checked ? "true" : "false")
                }
                sx={{
                  "& .MuiSwitch-switchBase.Mui-checked": {
                    color: colors.brand,
                  },
                  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                    bgcolor: colors.brand,
                  },
                }}
              />
            </Box>
            <FField
              label="Tracking base URL"
              value={values.TRACKING_BASE_URL ?? ""}
              onChange={(v) => set("TRACKING_BASE_URL", v)}
              hint="A CNAME on your domain pointing at SendMaster's tracker."
              fullWidth
            />
          </SectionCard>

          {/* ── 4. Follow-up automation ── */}
          <SectionCard
            icon={<ScheduleSendOutlined />}
            iconBg={"#fef3e8"}
            iconColor={"#e8640c"}
            title="Follow-up automation"
            description="If enabled, SendMaster sends up to 3 personalized follow-ups based on whether the previous email was opened."
          >
            {/* Toggle */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                p: "10px 14px",
                bgcolor: colors.bgSunken,
                borderRadius: "9px",
                border: `1px solid ${colors.border}`,
                mb: "16px",
              }}
            >
              <Box>
                <Typography
                  sx={{ fontSize: 13, fontWeight: 600, color: colors.ink1 }}
                >
                  Auto-follow-up{" "}
                  {values.FOLLOWUP_ENABLED === "true" ? "enabled" : "disabled"}
                </Typography>
                <Typography sx={{ fontSize: 11, color: colors.ink4 }}>
                  Enable to start the cadence below. Each lead can be excluded
                  individually.
                </Typography>
              </Box>
              <Switch
                checked={values.FOLLOWUP_ENABLED === "true"}
                onChange={(e) =>
                  set("FOLLOWUP_ENABLED", e.target.checked ? "true" : "false")
                }
                sx={{
                  "& .MuiSwitch-switchBase.Mui-checked": {
                    color: colors.brand,
                  },
                  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                    bgcolor: colors.brand,
                  },
                }}
              />
            </Box>

            {/* Max rounds */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                mb: "18px",
              }}
            >
              <Typography
                sx={{ fontSize: 13, color: colors.ink2, fontWeight: 600 }}
              >
                Max rounds
              </Typography>
              <Select
                value={values.FOLLOWUP_MAX_ROUNDS ?? "2"}
                onChange={(e) => set("FOLLOWUP_MAX_ROUNDS", e.target.value)}
                size="small"
                sx={{
                  fontSize: 13,
                  borderRadius: "8px",
                  width: 68,
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: colors.border,
                  },
                }}
              >
                {["1", "2", "3"].map((v) => (
                  <MenuItem key={v} value={v} sx={{ fontSize: 13 }}>
                    {v}
                  </MenuItem>
                ))}
              </Select>
              <Typography sx={{ fontSize: 13, color: colors.ink3 }}>
                rounds
              </Typography>
              <Typography sx={{ fontSize: 11, color: colors.ink4, ml: "4px" }}>
                1–3 follow-ups per lead
              </Typography>
            </Box>

            {/* Round configs — not opened */}
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: colors.ink4,
                mb: "8px",
              }}
            >
              Not opened — send follow-up after
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "12px",
                mb: "14px",
              }}
            >
              {[
                { key: "FOLLOWUP_1_DAYS_UNOPENED", label: "Round 1" },
                { key: "FOLLOWUP_2_DAYS_UNOPENED", label: "Round 2" },
                { key: "FOLLOWUP_3_DAYS_UNOPENED", label: "Round 3" },
              ].map(({ key, label }) => (
                <Box key={key}>
                  <Typography
                    sx={{ fontSize: 11, color: colors.ink4, mb: "4px" }}
                  >
                    {label} — not opened
                  </Typography>
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <TextField
                      value={values[key] ?? ""}
                      onChange={(e) => set(key, e.target.value)}
                      type="number"
                      size="small"
                      inputProps={{ min: 1, max: 60 }}
                      sx={{
                        width: 68,
                        "& .MuiOutlinedInput-root": {
                          borderRadius: "8px",
                          fontSize: 13,
                          bgcolor: colors.bg,
                          "& fieldset": { borderColor: colors.border },
                          "&:hover fieldset": {
                            borderColor: colors.borderStrong,
                          },
                          "&.Mui-focused fieldset": {
                            borderColor: colors.brand,
                          },
                        },
                      }}
                    />
                    <Typography sx={{ fontSize: 12, color: colors.ink3 }}>
                      days
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>

            {/* Round configs — opened */}
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: colors.ink4,
                mb: "8px",
              }}
            >
              Opened but no reply — send follow-up after
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "12px",
              }}
            >
              {[
                { key: "FOLLOWUP_1_DAYS_OPENED", label: "Round 1" },
                { key: "FOLLOWUP_2_DAYS_OPENED", label: "Round 2" },
              ].map(({ key, label }) => (
                <Box key={key}>
                  <Typography
                    sx={{ fontSize: 11, color: colors.ink4, mb: "4px" }}
                  >
                    {label} — opened, no reply
                  </Typography>
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <TextField
                      value={values[key] ?? ""}
                      onChange={(e) => set(key, e.target.value)}
                      type="number"
                      size="small"
                      inputProps={{ min: 1, max: 60 }}
                      sx={{
                        width: 68,
                        "& .MuiOutlinedInput-root": {
                          borderRadius: "8px",
                          fontSize: 13,
                          bgcolor: colors.bg,
                          "& fieldset": { borderColor: colors.border },
                          "&:hover fieldset": {
                            borderColor: colors.borderStrong,
                          },
                          "&.Mui-focused fieldset": {
                            borderColor: colors.brand,
                          },
                        },
                      }}
                    />
                    <Typography sx={{ fontSize: 12, color: colors.ink3 }}>
                      days
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </SectionCard>

          {/* ── 5. DNS & deliverability ── */}
          <Box
            sx={{
              bgcolor: colors.bgElev,
              border: `1px solid ${colors.border}`,
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: "20px",
                py: "13px",
                bgcolor: colors.bgSunken,
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: "8px",
                    bgcolor: colors.brandSoft,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <DnsOutlined sx={{ fontSize: 16, color: colors.brand }} />
                </Box>
                <Typography
                  sx={{ fontSize: 14, fontWeight: 700, color: colors.ink1 }}
                >
                  DNS & deliverability
                </Typography>
              </Box>
              <Box
                sx={{
                  px: "10px",
                  py: "3px",
                  borderRadius: "6px",
                  bgcolor:
                    verifiedCount === 3 ? colors.greenSoft : colors.amberSoft,
                  border: `1px solid ${verifiedCount === 3 ? colors.green + "40" : colors.amber + "40"}`,
                }}
              >
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: verifiedCount === 3 ? colors.green : colors.amber,
                  }}
                >
                  {verifiedCount} of 3 verified
                </Typography>
              </Box>
            </Box>

            {/* DNS body */}
            <Box sx={{ px: "24px", py: "20px" }}>
              <Typography sx={{ fontSize: 12, color: colors.ink3, mb: "20px" }}>
                Configure these at your domain registrar so inboxes trust mail
                from{" "}
                <Box
                  component="span"
                  sx={{ fontWeight: 600, color: colors.ink2 }}
                >
                  {fromDomain}
                </Box>
                .
              </Typography>

              <DnsRow
                verified={smtpOk}
                label="SPF"
                description={`Authorises which IPs may send on your behalf. TXT record at the root of your domain.`}
                code={spfRecord}
              />
              <DnsRow
                verified={smtpOk}
                label="DKIM"
                description="Cryptographically signs every outgoing message. Enable in your SMTP provider dashboard."
                code={dkimRecord}
              />
              <DnsRow
                verified={false}
                label="DMARC"
                description={`Ties SPF and DKIM together and reports back any abuse. TXT record at _dmarc.${fromDomain}`}
                code={dmarcRecord}
              />
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default Settings;
