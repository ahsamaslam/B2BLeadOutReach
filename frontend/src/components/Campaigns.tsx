import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  Bookmark,
  Delete,
  OpenInNew,
  People,
} from "@mui/icons-material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api, CampaignSummary, CampaignDetail } from "../services/api";
import { colors } from "../theme/tokens";

export default function Campaigns({ onOpenInBroadcast }: { onOpenInBroadcast?: (ids: number[], templateId?: number | null) => void }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampaignSummary | null>(null);

  const { data: rawCampaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: api.listCampaigns,
    staleTime: 30_000,
  });
  const campaigns = Array.isArray(rawCampaigns) ? rawCampaigns : [];

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ["campaigns", selectedId],
    queryFn: () => api.getCampaign(selectedId!),
    enabled: selectedId !== null,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCampaign(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign deleted");
      setDeleteTarget(null);
      if (selectedId === deleteTarget?.id) setSelectedId(null);
    },
    onError: () => toast.error("Failed to delete campaign"),
  });

  const handleOpenInBroadcast = (campaign: CampaignDetail) => {
    const ids = campaign.leads.map((l) => l.company_id);
    onOpenInBroadcast?.(ids, campaign.template_id);
  };

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selectedId !== null) {
    return (
      <Box sx={{ maxWidth: 900, mx: "auto", px: "32px", py: "32px" }}>
        <Button
          startIcon={<ArrowBack sx={{ fontSize: 14 }} />}
          onClick={() => setSelectedId(null)}
          sx={{ textTransform: "none", fontSize: 12, color: colors.ink3, mb: "20px", pl: 0 }}
        >
          All campaigns
        </Button>

        {loadingDetail || !detail ? (
          <Box display="flex" alignItems="center" gap="10px" mt="40px">
            <CircularProgress size={18} sx={{ color: colors.brand }} />
            <Typography fontSize={13} color={colors.ink3}>Loading campaign…</Typography>
          </Box>
        ) : (
          <>
            {/* Header */}
            <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb="24px">
              <Box>
                <Box display="flex" alignItems="center" gap="8px" mb="4px">
                  <Bookmark sx={{ fontSize: 18, color: colors.brand }} />
                  <Typography fontWeight={700} fontSize={22}>{detail.name}</Typography>
                </Box>
                <Typography fontSize={12} color={colors.ink3}>
                  {detail.leads.length} lead{detail.leads.length !== 1 ? "s" : ""} ·{" "}
                  Template: <strong>{detail.template_name ?? "None"}</strong> ·{" "}
                  Created {new Date(detail.created_at).toLocaleDateString()}
                </Typography>
              </Box>
              <Box display="flex" gap="8px">
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<OpenInNew sx={{ fontSize: "13px !important" }} />}
                  onClick={() => handleOpenInBroadcast(detail)}
                  sx={{
                    textTransform: "none",
                    fontSize: 12,
                    borderColor: colors.border,
                    color: colors.ink2,
                    borderRadius: "8px",
                    "&:hover": { borderColor: colors.borderStrong },
                  }}
                >
                  Open in Broadcast
                </Button>
              </Box>
            </Box>

            {/* Leads table */}
            <Box sx={{ border: `1px solid ${colors.border}`, borderRadius: "12px", overflow: "hidden" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: colors.bgSunken }}>
                    <TableCell sx={{ fontSize: 11, fontWeight: 600, color: colors.ink3, borderBottom: `1px solid ${colors.border}` }}>Company</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 600, color: colors.ink3, borderBottom: `1px solid ${colors.border}` }}>Contact</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 600, color: colors.ink3, borderBottom: `1px solid ${colors.border}` }}>Email</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 600, color: colors.ink3, borderBottom: `1px solid ${colors.border}` }}>Niche</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 600, color: colors.ink3, borderBottom: `1px solid ${colors.border}` }}>Location</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.leads.map((lead, i) => (
                    <TableRow
                      key={lead.company_id}
                      sx={{ "&:last-child td": { border: 0 }, bgcolor: i % 2 === 0 ? "white" : colors.bgSunken }}
                    >
                      <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{lead.company_name}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        <Box>
                          <Typography fontSize={12}>{lead.contact_name ?? "—"}</Typography>
                          {lead.contact_role && (
                            <Typography fontSize={11} color={colors.ink3}>{lead.contact_role}</Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.ink2 }}>{lead.contact_email ?? "—"}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        {lead.niche ? (
                          <Chip label={lead.niche} size="small" sx={{ fontSize: 11, height: 20, bgcolor: colors.bgSunken }} />
                        ) : "—"}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.ink2 }}>{lead.location ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </>
        )}
      </Box>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <Box sx={{ maxWidth: 900, mx: "auto", px: "32px", py: "32px" }}>
      {/* Page header */}
      <Box mb="28px">
        <Box display="flex" alignItems="center" gap="8px" mb="4px">
          <Bookmark sx={{ fontSize: 20, color: colors.brand }} />
          <Typography fontWeight={700} fontSize={24}>Campaigns</Typography>
        </Box>
        <Typography fontSize={13} color={colors.ink3}>
          Saved lead groups you can reopen, re-send, and follow up anytime.
        </Typography>
      </Box>

      {isLoading ? (
        <Box display="flex" alignItems="center" gap="10px" mt="40px">
          <CircularProgress size={18} sx={{ color: colors.brand }} />
          <Typography fontSize={13} color={colors.ink3}>Loading campaigns…</Typography>
        </Box>
      ) : campaigns.length === 0 ? (
        <Box
          sx={{
            border: `1.5px dashed ${colors.border}`,
            borderRadius: "14px",
            py: "60px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <Bookmark sx={{ fontSize: 36, color: colors.ink4 }} />
          <Typography fontSize={14} fontWeight={600} color={colors.ink2}>No campaigns yet</Typography>
          <Typography fontSize={12} color={colors.ink3} textAlign="center" maxWidth={320}>
            Go to Broadcast, select leads and a template, then click{" "}
            <strong>"Save as campaign"</strong> to save them here.
          </Typography>
          <Button
            variant="contained"
            size="small"
            onClick={() => onOpenInBroadcast?.([], null)}
            sx={{
              mt: "8px",
              textTransform: "none",
              fontSize: 12,
              fontWeight: 600,
              bgcolor: colors.brand,
              "&:hover": { bgcolor: colors.brandInk },
              borderRadius: "8px",
            }}
          >
            Go to Broadcast
          </Button>
        </Box>
      ) : (
        <Box display="flex" flexDirection="column" gap="12px">
          {campaigns.map((c) => (
            <Box
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              sx={{
                border: `1px solid ${colors.border}`,
                borderRadius: "12px",
                px: "20px",
                py: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                transition: "border-color 0.15s, box-shadow 0.15s",
                "&:hover": {
                  borderColor: colors.brand,
                  boxShadow: `0 0 0 1px ${colors.brand}20`,
                },
              }}
            >
              <Box display="flex" alignItems="center" gap="14px">
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: "9px",
                    bgcolor: `${colors.brand}15`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Bookmark sx={{ fontSize: 18, color: colors.brand }} />
                </Box>
                <Box>
                  <Typography fontWeight={600} fontSize={14}>{c.name}</Typography>
                  <Box display="flex" alignItems="center" gap="8px" mt="2px">
                    <Box display="flex" alignItems="center" gap="4px">
                      <People sx={{ fontSize: 12, color: colors.ink3 }} />
                      <Typography fontSize={11} color={colors.ink3}>
                        {c.lead_count} lead{c.lead_count !== 1 ? "s" : ""}
                      </Typography>
                    </Box>
                    {c.template_name && (
                      <Typography fontSize={11} color={colors.ink3}>· {c.template_name}</Typography>
                    )}
                    <Typography fontSize={11} color={colors.ink4}>
                      · {new Date(c.created_at).toLocaleDateString()}
                    </Typography>
                  </Box>
                </Box>
              </Box>
              <Box display="flex" alignItems="center" gap="8px" onClick={(e) => e.stopPropagation()}>
                <Tooltip title="Open in Broadcast">
                  <IconButton
                    size="small"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const detail = await api.getCampaign(c.id);
                        const ids = detail.leads.map((l) => l.company_id);
                        onOpenInBroadcast?.(ids, c.template_id);
                      } catch { /* fallback: just open broadcast empty */ onOpenInBroadcast?.([], c.template_id); }
                    }}
                    sx={{ color: colors.ink3, "&:hover": { color: colors.brand } }}
                  >
                    <OpenInNew sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete campaign">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                    sx={{ color: colors.ink3, "&:hover": { color: "#ef4444" } }}
                  >
                    <Delete sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Delete confirm dialog */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: "14px" } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 15, pb: 1 }}>Delete campaign?</DialogTitle>
        <DialogContent>
          <Typography fontSize={13} color={colors.ink2}>
            "<strong>{deleteTarget?.name}</strong>" will be permanently deleted. The leads themselves are not affected.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: "8px" }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            sx={{ textTransform: "none", fontSize: 12, color: colors.ink3 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            sx={{
              textTransform: "none",
              fontSize: 12,
              fontWeight: 600,
              bgcolor: "#ef4444",
              "&:hover": { bgcolor: "#dc2626" },
              borderRadius: "8px",
            }}
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
