import React, { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  TextField,
  Typography,
} from "@mui/material";
import toast from "react-hot-toast";
import { api, authStorage } from "../services/api";

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
    <Container maxWidth="sm" sx={{ mt: 10 }}>
      <Card>
        <CardContent>
          <Typography variant="h5" fontWeight="bold" mb={3}>
            {isRegisterMode ? "Create Account" : "Login"}
          </Typography>

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
        </CardContent>
      </Card>
    </Container>
  );
};

export default Login;
