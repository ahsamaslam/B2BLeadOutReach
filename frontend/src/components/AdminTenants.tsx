import React, { useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
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
import { PageHeader, StatusChip } from "./primitives";
import { colors } from "../theme/tokens";

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
    <Box>
      <PageHeader
        eyebrow="Admin"
        title="Tenant Management"
        description="Admin view — manage all tenants and their subscription plans"
      />

      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow
              sx={{
                "& th": {
                  fontWeight: 600,
                  bgcolor: colors.bgSunken,
                  color: colors.ink3,
                  fontSize: 12,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                },
              }}
            >
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
                    <StatusChip
                      tone={tenant.is_active ? "green" : "red"}
                      dot
                      label={tenant.is_active ? "Active" : "Inactive"}
                    />
                  </TableCell>
                  <TableCell>{tenant.created_at}</TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <StatusChip
                        label={tenant.plan.toUpperCase()}
                        tone="brand"
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
    </Box>
  );
};

export default AdminTenants;
