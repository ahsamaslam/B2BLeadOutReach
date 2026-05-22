// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import {
  FileDownloadOutlined,
  RefreshOutlined,
  AddOutlined,
  LockOutlined,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";

import { Shell, NavId } from "./components/shell";
import Dashboard from "./components/Dashboard";
import Login from "./components/Login";
import LeadsList from "./components/LeadsList";
import CampaignTemplates from "./components/CampaignTemplates";
import EmailBroadcast from "./components/EmailBroadcast";
import History from "./components/History";
import Settings from "./components/Settings";
import Pricing from "./components/Pricing";
import AdminTenants from "./components/AdminTenants";
import { api, authStorage } from "./services/api";
import { colors } from "./theme/tokens";

// ── Force-change-password dialog shown on first login ─────────────────────────

function ForceChangePasswordModal({
  open,
  onSuccess,
}: {
  open: boolean;
  onSuccess: () => void;
}) {
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(currentPwd, newPwd);
      toast.success("Password changed! Welcome to SendMaster.");
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? "Failed to change password";
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: "14px" } }}
    >
      <DialogTitle sx={{ pb: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "10px",
              bgcolor: colors.brandSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <LockOutlined sx={{ fontSize: 18, color: colors.brand }} />
          </Box>
          <Box>
            <Typography
              sx={{ fontSize: 16, fontWeight: 700, color: colors.ink1 }}
            >
              Set your password
            </Typography>
            <Typography sx={{ fontSize: 12, color: colors.ink3 }}>
              You must change your temporary password before continuing.
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: "16px !important" }}>
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ display: "flex", flexDirection: "column", gap: "14px" }}
        >
          <TextField
            label="Temporary password"
            type={showCurrent ? "text" : "password"}
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            required
            fullWidth
            size="small"
            autoComplete="current-password"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setShowCurrent((v) => !v)}
                    tabIndex={-1}
                  >
                    {showCurrent ? (
                      <VisibilityOff sx={{ fontSize: 16 }} />
                    ) : (
                      <Visibility sx={{ fontSize: 16 }} />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: "9px" } }}
          />
          <TextField
            label="New password"
            type={showNew ? "text" : "password"}
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            required
            fullWidth
            size="small"
            autoComplete="new-password"
            helperText="Minimum 8 characters"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setShowNew((v) => !v)}
                    tabIndex={-1}
                  >
                    {showNew ? (
                      <VisibilityOff sx={{ fontSize: 16 }} />
                    ) : (
                      <Visibility sx={{ fontSize: 16 }} />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: "9px" } }}
          />
          <TextField
            label="Confirm new password"
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            required
            fullWidth
            size="small"
            autoComplete="new-password"
            error={confirmPwd.length > 0 && confirmPwd !== newPwd}
            helperText={
              confirmPwd.length > 0 && confirmPwd !== newPwd
                ? "Passwords do not match"
                : ""
            }
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: "9px" } }}
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={saving}
            sx={{
              mt: "4px",
              textTransform: "none",
              fontWeight: 700,
              fontSize: 14,
              bgcolor: colors.brand,
              borderRadius: "9px",
              boxShadow: "none",
              "&:hover": { bgcolor: colors.brandInk, boxShadow: "none" },
            }}
          >
            {saving ? (
              <CircularProgress size={18} sx={{ color: "#fff" }} />
            ) : (
              "Set new password"
            )}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nameOrEmail.slice(0, 2).toUpperCase();
}

const CRUMB: Record<NavId, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  templates: "Templates",
  broadcast: "Broadcast",
  history: "Sent history",
  settings: "Settings",
  pricing: "Plan & billing",
  admin: "Admin · Tenants",
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<NavId>("dashboard");
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState({ name: "User", email: "", initials: "U" });
  const [campaignLeadIds, setCampaignLeadIds] = useState<number[]>([]);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("Workspace");
  const [usage, setUsage] = useState<
    { sent: number; cap: number | null; planLabel: string } | undefined
  >(undefined);

  // Admin state
  const [adminInviteOpen, setAdminInviteOpen] = useState(false);
  const [adminSyncKey, setAdminSyncKey] = useState(0);
  const [adminTenantCount, setAdminTenantCount] = useState<number | undefined>(
    undefined,
  );

  const fetchUsage = async () => {
    try {
      const u = await api.getUsage();
      setWorkspaceName(u.tenant_name);
      setUsage({ sent: u.sent, cap: u.cap, planLabel: u.plan_label });
    } catch {}
  };

  useEffect(() => {
    const bootstrapAuth = async () => {
      const token = authStorage.getToken();
      if (!token) {
        setIsAuthenticated(false);
        return;
      }
      try {
        const u = await api.me();
        setIsAuthenticated(true);
        setIsAdmin(u.is_admin ?? false);
        setMustChangePassword(u.must_change_password ?? false);
        if (u.email) {
          setUser({
            name: u.email,
            email: u.email,
            initials: initials(u.email),
          });
        }
        // Fetch admin stats for sidebar badge
        if (u.is_admin) {
          try {
            const stats = await api.adminGetStats();
            setAdminTenantCount(stats.total_tenants);
          } catch {}
        }
        await fetchUsage();
      } catch {
        authStorage.clearToken();
        setIsAuthenticated(false);
      }
    };
    bootstrapAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    authStorage.clearToken();
    setIsAuthenticated(false);
    setIsAdmin(false);
  };

  const handleSendToSelected = (ids: number[]) => {
    setCampaignLeadIds(ids);
    setActiveTab("broadcast");
  };

  // TopBar actions for Admin page
  const adminTopBarActions =
    activeTab === "admin" && isAdmin ? (
      <>
        <Button
          variant="outlined"
          size="small"
          startIcon={
            <FileDownloadOutlined sx={{ fontSize: "13px !important" }} />
          }
          sx={{
            textTransform: "none",
            fontSize: 12,
            fontWeight: 600,
            borderColor: colors.border,
            color: colors.ink2,
            borderRadius: "8px",
          }}
        >
          Export
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshOutlined sx={{ fontSize: "13px !important" }} />}
          onClick={() => setAdminSyncKey((k) => k + 1)}
          sx={{
            textTransform: "none",
            fontSize: 12,
            fontWeight: 600,
            borderColor: colors.border,
            color: colors.ink2,
            borderRadius: "8px",
          }}
        >
          Sync
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddOutlined sx={{ fontSize: "13px !important" }} />}
          onClick={() => setAdminInviteOpen(true)}
          sx={{
            textTransform: "none",
            fontSize: 12,
            fontWeight: 600,
            bgcolor: colors.brand,
            borderRadius: "8px",
            boxShadow: "none",
            "&:hover": { bgcolor: colors.brandInk, boxShadow: "none" },
          }}
        >
          Invite tenant
        </Button>
      </>
    ) : undefined;

  return (
    <>
      <Toaster position="top-right" />
      <ForceChangePasswordModal
        open={isAuthenticated && mustChangePassword}
        onSuccess={() => setMustChangePassword(false)}
      />
      {!isAuthenticated ? (
        <Login
          onAuthSuccess={async () => {
            try {
              const u = await api.me();
              setIsAdmin(u.is_admin ?? false);
              setMustChangePassword(u.must_change_password ?? false);
              if (u.email) {
                setUser({
                  name: u.email,
                  email: u.email,
                  initials: initials(u.email),
                });
              }
              if (u.is_admin) {
                try {
                  const stats = await api.adminGetStats();
                  setAdminTenantCount(stats.total_tenants);
                } catch {}
              }
              await fetchUsage();
            } catch {}
            setIsAuthenticated(true);
          }}
        />
      ) : (
        <Shell
          active={activeTab}
          onNavigate={setActiveTab}
          isAdmin={isAdmin}
          user={user}
          workspace={{ name: workspaceName }}
          usage={usage}
          onLogout={handleLogout}
          crumb={CRUMB[activeTab]}
          topBarActions={adminTopBarActions}
          adminTenantCount={adminTenantCount}
          flush={
            activeTab === "templates" ||
            activeTab === "broadcast" ||
            activeTab === "history"
          }
        >
          {activeTab === "dashboard" && (
            <Dashboard onShowHistory={() => setActiveTab("history")} />
          )}
          {activeTab === "leads" && (
            <LeadsList onSendToSelected={handleSendToSelected} />
          )}
          {activeTab === "templates" && <CampaignTemplates />}
          {activeTab === "broadcast" && (
            <EmailBroadcast
              key={campaignLeadIds.join(",")}
              initialSelectedIds={campaignLeadIds}
            />
          )}
          {activeTab === "history" && <History />}
          {activeTab === "settings" && <Settings />}
          {activeTab === "pricing" && <Pricing />}
          {activeTab === "admin" && isAdmin && (
            <AdminTenants
              inviteOpen={adminInviteOpen}
              onInviteClose={() => setAdminInviteOpen(false)}
              syncKey={adminSyncKey}
            />
          )}
        </Shell>
      )}
    </>
  );
};

export default App;
