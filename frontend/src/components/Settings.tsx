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
  TextField,
  Typography,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Save,
  Business,
  Email,
  Psychology,
  LinkedIn,
  Search,
} from "@mui/icons-material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  branding: { label: "Company Branding", icon: <Business />, color: "#1976d2" },
  smtp: { label: "Email / SMTP", icon: <Email />, color: "#388e3c" },
  ai: { label: "AI Configuration", icon: <Psychology />, color: "#7b1fa2" },
  linkedin: {
    label: "LinkedIn Integration",
    icon: <LinkedIn />,
    color: "#0077b5",
  },
  search: { label: "Google Search", icon: <Search />, color: "#f57c00" },
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
        Settings saved here override the global environment variables for your
        workspace. Leave a field blank to fall back to the server-level default.
      </Alert>

      <Grid container spacing={3}>
        {Object.entries(schema).map(([category, fields]) => {
          const meta = CATEGORY_META[category] ?? {
            label: category,
            icon: null,
            color: "#333",
          };
          return (
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
                                          onClick={() => toggleShow(field.key)}
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
        })}
      </Grid>
    </Container>
  );
};

export default Settings;
