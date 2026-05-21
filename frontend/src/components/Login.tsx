import React, { useState } from "react";
import {
  Box,
  Button,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import toast from "react-hot-toast";
import { api, authStorage } from "../services/api";
import { colors } from "../theme/tokens";

type LoginProps = {
  onAuthSuccess: () => void;
};

const Login: React.FC<LoginProps> = ({ onAuthSuccess }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isRegisterMode) {
        await api.register({ email, password });
        toast.success("User created. Please login.");
        setIsRegisterMode(false);
      } else {
        const response = await api.login({ email, password });
        authStorage.setToken(response.access_token);
        toast.success("Logged in successfully");
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
      display="flex"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      sx={{ bgcolor: colors.bg }}
    >
      <Paper
        variant="outlined"
        sx={{ width: "100%", maxWidth: 400, p: 4, borderRadius: 3 }}
      >
        <Box mb={3}>
          <Typography variant="h5" fontWeight={700} color={colors.brand}>
            SendMaster
          </Typography>
          <Typography variant="h6" fontWeight={600} mt={1}>
            {isRegisterMode ? "Create Account" : "Sign in"}
          </Typography>
        </Box>

          <Box
            component="form"
            onSubmit={handleSubmit}
            display="flex"
            flexDirection="column"
            gap={2}
          >
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
            />

            <Button type="submit" variant="contained" disabled={loading}>
              {loading
                ? "Please wait..."
                : isRegisterMode
                  ? "Create Account"
                  : "Login"}
            </Button>

            <Button
              type="button"
              variant="text"
              onClick={() => setIsRegisterMode(!isRegisterMode)}
            >
              {isRegisterMode
                ? "Have an account? Login"
                : "Need an account? Register"}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default Login;
