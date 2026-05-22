import React, { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { Email, ArrowForward } from "@mui/icons-material";
import toast from "react-hot-toast";
import { api, authStorage } from "../services/api";
import { colors, shadow } from "../theme/tokens";

type LoginProps = {
  onAuthSuccess: () => void;
};

/* ── Inline brand SVG icons ──────────────────────────────────────────── */
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908C16.658 14.083 17.64 11.927 17.64 9.2z"
      fill="#4285F4"
    />
    <path
      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      fill="#34A853"
    />
    <path
      d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      fill="#FBBC05"
    />
    <path
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      fill="#EA4335"
    />
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={colors.ink2}>
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
  </svg>
);

const Login: React.FC<LoginProps> = ({ onAuthSuccess }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegisterMode) {
        await api.register({ email, password });
        toast.success("Workspace created. Please sign in.");
        setIsRegisterMode(false);
      } else {
        const response = await api.login({ email, password });
        authStorage.setToken(response.access_token);
        toast.success("Signed in successfully");
        onAuthSuccess();
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #eceaf8 0%, #f5f4f0 42%, #ede5d8 100%)",
      }}
    >
      {/* ── Left hero panel ─────────────────────────────────────── */}
      <Box
        sx={{
          flex: "0 0 55%",
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "space-between",
          p: "44px 56px",
        }}
      >
        {/* Logo */}
        <Box display="flex" alignItems="center" gap={1}>
          <Box
            sx={{
              width: 32,
              height: 32,
              bgcolor: colors.brand,
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Email sx={{ color: "#fff", fontSize: 17 }} />
          </Box>
          <Typography fontWeight={700} fontSize={15} color={colors.ink1}>
            SendMaster
          </Typography>
        </Box>

        {/* Hero copy */}
        <Box>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.09em",
              color: colors.ink3,
              textTransform: "uppercase",
              mb: 2.5,
            }}
          >
            V2.4 · Outbound Mailer
          </Typography>

          <Typography
            variant="h2"
            fontWeight={800}
            lineHeight={1.15}
            color={colors.ink1}
            sx={{ fontSize: { md: "2.6rem", lg: "3.1rem" } }}
          >
            Control every email,
            <br />
            <Box
              component="em"
              sx={{ fontStyle: "italic", color: colors.brand }}
            >
              every
            </Box>{" "}
            time.
          </Typography>

          <Typography
            color={colors.ink3}
            fontSize={15}
            lineHeight={1.65}
            mt={2.5}
            mb={5}
            maxWidth={420}
          >
            Upload leads, generate personalized outreach with your own
            templates, and review each draft before it leaves your sender.
          </Typography>

          {/* Stats */}
          <Box display="flex" gap={5} flexWrap="wrap">
            {[
              { value: "3.2k+", label: "leads enriched this week" },
              { value: "41%", label: "average open rate" },
            ].map((s) => (
              <Box key={s.value}>
                <Typography fontWeight={700} fontSize={22} color={colors.ink1}>
                  {s.value}
                </Typography>
                <Typography fontSize={13} color={colors.ink3} mt={0.25}>
                  {s.label}
                </Typography>
              </Box>
            ))}
            <Box>
              <Typography fontWeight={700} fontSize={15} color={colors.ink1}>
                SPF · DKIM · DMARC
              </Typography>
              <Typography fontSize={13} color={colors.ink3} mt={0.25}>
                deliverability built-in
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Footer */}
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography fontSize={12} color={colors.ink4}>
            © 2026 UnionLogix · Privacy · Terms
          </Typography>
          <Box display="flex" alignItems="center" gap={0.75}>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                bgcolor: colors.green,
              }}
            />
            <Typography fontSize={12} color={colors.ink4}>
              All systems normal
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* ── Right login panel ────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 3, md: 4 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            maxWidth: 440,
            p: { xs: "28px 24px", md: "40px 36px" },
            borderRadius: "16px",
            border: `1px solid ${colors.border}`,
            boxShadow: shadow.sh3,
            bgcolor: colors.bgElev,
          }}
        >
          <Typography
            variant="h4"
            fontWeight={700}
            color={colors.ink1}
            mb={0.5}
          >
            {isRegisterMode ? "Create workspace" : "Sign in"}
          </Typography>
          <Typography fontSize={14} color={colors.ink3} mb={3}>
            {isRegisterMode
              ? "Create your SendMaster workspace."
              : "Welcome back. Enter your workspace details."}
          </Typography>

          {/* OAuth buttons */}
          {!isRegisterMode && (
            <>
              <Box display="flex" flexDirection="column" gap={1.5} mb={2.5}>
                {[
                  { icon: <GoogleIcon />, label: "Continue with Google" },
                  { icon: <GitHubIcon />, label: "Continue with GitHub" },
                ].map((btn) => (
                  <Button
                    key={btn.label}
                    variant="outlined"
                    fullWidth
                    onClick={() => toast("OAuth coming soon", { icon: "🔒" })}
                    startIcon={btn.icon}
                    sx={{
                      color: colors.ink2,
                      borderColor: colors.border,
                      fontWeight: 500,
                      fontSize: 14,
                      py: 1.1,
                      borderRadius: "10px",
                      textTransform: "none",
                      "&:hover": {
                        borderColor: colors.borderStrong,
                        bgcolor: colors.bgSunken,
                      },
                    }}
                  >
                    {btn.label}
                  </Button>
                ))}
              </Box>

              {/* Divider */}
              <Box display="flex" alignItems="center" gap={1.5} mb={2.5}>
                <Box sx={{ flex: 1, height: "1px", bgcolor: colors.border }} />
                <Typography fontSize={12} color={colors.ink3}>
                  or with email
                </Typography>
                <Box sx={{ flex: 1, height: "1px", bgcolor: colors.border }} />
              </Box>
            </>
          )}

          {/* Form */}
          <Box
            component="form"
            onSubmit={handleSubmit}
            display="flex"
            flexDirection="column"
            gap={2}
          >
            <TextField
              label="Work email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              size="small"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
            />

            <Box>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={0.75}
              >
                <Typography fontSize={13} fontWeight={500} color={colors.ink2}>
                  Password
                </Typography>
                {!isRegisterMode && (
                  <Typography
                    fontSize={13}
                    color={colors.brand}
                    sx={{
                      cursor: "pointer",
                      "&:hover": { textDecoration: "underline" },
                    }}
                    onClick={() => toast("Password reset coming soon")}
                  >
                    Forgot?
                  </Typography>
                )}
              </Box>
              <TextField
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                size="small"
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
              />
            </Box>

            {!isRegisterMode && (
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={keepSignedIn}
                    onChange={(e) => setKeepSignedIn(e.target.checked)}
                    sx={{
                      color: colors.border,
                      "&.Mui-checked": { color: colors.brand },
                    }}
                  />
                }
                label={
                  <Typography fontSize={13} color={colors.ink2}>
                    Keep me signed in for 30 days
                  </Typography>
                }
              />
            )}

            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
              endIcon={<ArrowForward sx={{ fontSize: "16px !important" }} />}
              sx={{
                py: 1.3,
                borderRadius: "10px",
                fontWeight: 600,
                fontSize: 14,
                textTransform: "none",
                bgcolor: colors.brand,
                "&:hover": { bgcolor: colors.brandInk },
                "&:disabled": { opacity: 0.6 },
              }}
            >
              {loading
                ? "Please wait…"
                : isRegisterMode
                  ? "Create workspace →"
                  : "Sign in to SendMaster"}
            </Button>
          </Box>

          <Typography
            textAlign="center"
            fontSize={13}
            color={colors.ink3}
            mt={2.5}
          >
            {isRegisterMode
              ? "Already have an account? "
              : "New to SendMaster? "}
            <Typography
              component="span"
              fontSize={13}
              color={colors.brand}
              sx={{
                cursor: "pointer",
                "&:hover": { textDecoration: "underline" },
              }}
              onClick={() => setIsRegisterMode(!isRegisterMode)}
            >
              {isRegisterMode ? "Sign in →" : "Create workspace →"}
            </Typography>
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
};

export default Login;
