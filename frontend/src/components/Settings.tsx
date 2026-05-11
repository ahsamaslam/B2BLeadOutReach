import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  InputAdornment,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import Portfolio from "./Portfolio";
import {
  Visibility,
  VisibilityOff,
  Save,
  Business,
  Email,
  TrackChanges,
  ScheduleSend,
} from "@mui/icons-material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  branding: { label: "Company Branding", icon: <Business />, color: "#1976d2" },
  email: { label: "Email / SMTP", icon: <Email />, color: "#388e3c" },
  tracking: {
    label: "Email Tracking",
    icon: <TrackChanges />,
    color: "#7b1fa2",
  },
  followup: {
    label: "Follow-up Automation",
    icon: <ScheduleSend />,
    color: "#e65100",
  },
};

const PLAN_COLORS: Record<
  string,
  "default" | "primary" | "secondary" | "success" | "warning"
> = {
  free: "default",
  starter: "primary",
  professional: "success",
  enterprise: "warning",
};

const Settings: React.FC = () => {
  const queryClient = useQueryClient();
  const [settingsTab, setSettingsTab] = useState(0);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>(
    {},
  );
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  useEffect(() => {
    if (data?.values) {
      setFormValues({ ...data.values });
      setDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.updateSettings(formValues),
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setDirty(false);
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const toggleShow = (key: string) =>
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" mt={8}>
        <CircularProgress />
      </Box>
    );
  }

  const schema = data?.schema ?? {};

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Tabs
        value={settingsTab}
        onChange={(_, v) => setSettingsTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        <Tab label="Configuration" />
        <Tab label="Portfolio" />
      </Tabs>

      {settingsTab === 1 && <Portfolio />}

      {settingsTab === 0 && (
        <>
          {/* Header */}
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={3}
          >
            <Box>
              <Typography variant="h4" fontWeight="bold">
                Settings
              </Typography>
              <Typography color="text.secondary">
                {data?.tenant_name} &nbsp;·&nbsp;
                <Chip
                  label={data?.plan?.toUpperCase() ?? "FREE"}
                  color={PLAN_COLORS[data?.plan ?? "free"]}
                  size="small"
                  sx={{ fontWeight: "bold" }}
                />
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<Save />}
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }}>
            Settings saved here override the global environment variables for
            your workspace. Leave a field blank to fall back to the server-level
            default.
          </Alert>

          <Grid container spacing={3}>
            {Object.entries(schema).flatMap(([category, fields]) => {
              const meta = CATEGORY_META[category] ?? {
                label: category,
                icon: null,
                color: "#333",
              };
              const card = (
                <Grid item xs={12} key={category}>
                  <Paper variant="outlined" sx={{ overflow: "hidden" }}>
                    <Box
                      px={3}
                      py={1.5}
                      display="flex"
                      alignItems="center"
                      gap={1}
                      sx={{
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        bgcolor: "grey.50",
                      }}
                    >
                      <Box sx={{ color: meta.color }}>{meta.icon}</Box>
                      <Typography fontWeight="bold" color={meta.color}>
                        {meta.label}
                      </Typography>
                    </Box>
                    <Box p={3}>
                      <Grid container spacing={2}>
                        {(
                          fields as Array<{
                            key: string;
                            label: string;
                            type: string;
                          }>
                        ).map((field) => {
                          const isPassword = field.type === "password";
                          const show = showPasswords[field.key] ?? false;
                          return (
                            <Grid item xs={12} md={6} key={field.key}>
                              <TextField
                                fullWidth
                                label={field.label}
                                type={isPassword && !show ? "password" : "text"}
                                value={formValues[field.key] ?? ""}
                                onChange={(e) =>
                                  handleChange(field.key, e.target.value)
                                }
                                size="small"
                                InputProps={
                                  isPassword
                                    ? {
                                        endAdornment: (
                                          <InputAdornment position="end">
                                            <Box
                                              component="span"
                                              onClick={() =>
                                                toggleShow(field.key)
                                              }
                                              sx={{
                                                cursor: "pointer",
                                                display: "flex",
                                              }}
                                            >
                                              {show ? (
                                                <VisibilityOff fontSize="small" />
                                              ) : (
                                                <Visibility fontSize="small" />
                                              )}
                                            </Box>
                                          </InputAdornment>
                                        ),
                                      }
                                    : undefined
                                }
                              />
                            </Grid>
                          );
                        })}
                      </Grid>
                    </Box>
                  </Paper>
                </Grid>
              );
              if (category !== "email") return [card];
              return [
                card,
                <Grid item xs={12} key="dns-notice">
                  <Paper
                    variant="outlined"
                    sx={{ overflow: "hidden", borderColor: "warning.main" }}
                  >
                    <Box
                      px={3}
                      py={1.5}
                      display="flex"
                      alignItems="center"
                      gap={1}
                      sx={{
                        borderBottom: "1px solid",
                        borderColor: "warning.light",
                        bgcolor: "#fff8e1",
                      }}
                    >
                      <Typography fontWeight="bold" color="warning.dark">
                        ⚠️ DNS &amp; Deliverability — Required for Inbox
                        Delivery
                      </Typography>
                    </Box>
                    <Box p={3}>
                      <Typography variant="body2" color="text.secondary" mb={2}>
                        These must be configured at your domain registrar or DNS
                        provider. Without them, emails can still land in spam
                        regardless of the SMTP settings above.
                      </Typography>
                      {[
                        {
                          label: "SPF Record",
                          code: "v=spf1 include:your-smtp-provider.com ~all",
                          desc: "Add as a TXT record on your sending domain. Tells receiving servers which IPs are authorised to send on your behalf.",
                        },
                        {
                          label: "DKIM Signing",
                          code: "Enable in your SMTP provider dashboard (Hostinger, Google Workspace, etc.)",
                          desc: "Cryptographically signs every outgoing email. Your provider generates the DNS record for you to add to your domain.",
                        },
                        {
                          label: "DMARC Record",
                          code: "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com",
                          desc: "Add as a TXT record at _dmarc.yourdomain.com. Ties SPF + DKIM together and tells receivers how to handle authentication failures.",
                        },
                      ].map(({ label, code, desc }) => (
                        <Box key={label} mb={2.5}>
                          <Typography
                            variant="subtitle2"
                            fontWeight="bold"
                            gutterBottom
                          >
                            {label}
                          </Typography>
                          <Box
                            component="code"
                            sx={{
                              display: "block",
                              bgcolor: "grey.100",
                              px: 2,
                              py: 1,
                              borderRadius: 1,
                              fontFamily: "monospace",
                              fontSize: 13,
                              wordBreak: "break-all",
                              mb: 0.5,
                            }}
                          >
                            {code}
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {desc}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Paper>
                </Grid>,
              ];
            })}
          </Grid>
        </>
      )}
    </Container>
  );
};

export default Settings;
