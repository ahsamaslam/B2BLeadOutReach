import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { People } from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";

const PLAN_COLORS: Record<
  string,
  "default" | "primary" | "secondary" | "success" | "warning" | "error"
> = {
  free: "default",
  starter: "primary",
  professional: "success",
  enterprise: "warning",
};

const AdminTenants: React.FC = () => {
  const queryClient = useQueryClient();
  const [pendingPlans, setPendingPlans] = useState<Record<number, string>>({});

  const { data: tenants, isLoading } = useQuery({
    queryKey: ["adminTenants"],
    queryFn: api.adminListTenants,
  });

  const planMutation = useMutation({
    mutationFn: ({ tenantId, plan }: { tenantId: number; plan: string }) =>
      api.adminUpdatePlan(tenantId, plan),
    onSuccess: () => {
      toast.success("Plan updated");
      queryClient.invalidateQueries({ queryKey: ["adminTenants"] });
      setPendingPlans({});
    },
    onError: () => toast.error("Failed to update plan"),
  });

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" mt={8}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <People color="primary" sx={{ fontSize: 36 }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Tenant Management
          </Typography>
          <Typography color="text.secondary">
            Admin view — manage all tenants and their subscription plans
          </Typography>
        </Box>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: "grey.50" }}>
              <TableCell>
                <strong>Tenant</strong>
              </TableCell>
              <TableCell>
                <strong>Users</strong>
              </TableCell>
              <TableCell>
                <strong>Status</strong>
              </TableCell>
              <TableCell>
                <strong>Created</strong>
              </TableCell>
              <TableCell>
                <strong>Plan</strong>
              </TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {(tenants ?? []).map((tenant) => {
              const selectedPlan = pendingPlans[tenant.id] ?? tenant.plan;
              const isDirty = selectedPlan !== tenant.plan;
              return (
                <TableRow key={tenant.id} hover>
                  <TableCell>
                    <Typography fontWeight="bold">{tenant.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      #{tenant.id}
                    </Typography>
                  </TableCell>
                  <TableCell>{tenant.user_count}</TableCell>
                  <TableCell>
                    <Chip
                      label={tenant.is_active ? "Active" : "Inactive"}
                      color={tenant.is_active ? "success" : "error"}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{tenant.created_at}</TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Chip
                        label={tenant.plan.toUpperCase()}
                        color={PLAN_COLORS[tenant.plan]}
                        size="small"
                      />
                      <FormControl size="small" sx={{ minWidth: 130 }}>
                        <Select
                          value={selectedPlan}
                          onChange={(e) =>
                            setPendingPlans((prev) => ({
                              ...prev,
                              [tenant.id]: e.target.value,
                            }))
                          }
                          variant="outlined"
                        >
                          <MenuItem value="free">Free</MenuItem>
                          <MenuItem value="starter">Starter</MenuItem>
                          <MenuItem value="professional">Professional</MenuItem>
                          <MenuItem value="enterprise">Enterprise</MenuItem>
                        </Select>
                      </FormControl>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!isDirty || planMutation.isPending}
                      onClick={() =>
                        planMutation.mutate({
                          tenantId: tenant.id,
                          plan: selectedPlan,
                        })
                      }
                    >
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
};

export default AdminTenants;
