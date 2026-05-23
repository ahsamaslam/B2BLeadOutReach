// @ts-nocheck
import React, { useLayoutEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Send, Visibility } from "@mui/icons-material";
import { PageHeader, StatusChip, EmptyState } from "./primitives";
import { colors } from "../theme/tokens";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { api, authStorage } from "../services/api";
import {
  BROADCAST_LEADS_STORAGE_KEY,
  consumeBroadcastLeadsFromStorage,
  type BroadcastLeadPayload,
  type BroadcastLocationState,
} from "../broadcastLeads";

type CampaignTemplate = {
  id: number;
  name: string;
  subject_template: string;
  body_template: string;
  instructions: string | null;
  attach_portfolio: boolean;
};

type LeadRow = {
  id: number;
  companyName: string;
  niche: string;
  domain: string;
  location: string;
  platform: string;
  decisionMaker: string;
  role: string;
  linkedInProfile: string;
  companyLinkedIn: string;
  emailPattern: string;
  aiGapInsight: string;
  remarks: string;
  ownerEmail?: string;
};

type GeneratedEmail = {
  leadId: number;
  recipientName: string;
  companyName: string;
  recipientEmail: string;
  subject: string;
  body: string;
  error?: string;
};

const resolveEmailPreview = (lead: LeadRow): string => {
  const direct = lead.ownerEmail?.trim();
  if (direct && direct.includes("@")) return direct;
  const pattern = lead.emailPattern.trim().toLowerCase();
  const domain = lead.domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (pattern.includes("@")) return pattern;
  const parts = lead.decisionMaker
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  if (!domain || !first) return "";
  if (pattern.includes("first.last") && last)
    return `${first}.${last}@${domain}`;
  if (pattern.includes("first_last") && last)
    return `${first}_${last}@${domain}`;
  if (pattern.includes("firstlast") && last) return `${first}${last}@${domain}`;
  if (pattern.includes("f.last") && last)
    return `${first.slice(0, 1)}.${last}@${domain}`;
  return `${first}${last ? `.${last}` : ""}@${domain}`;
};

function broadcastPayloadToLeadRow(p: BroadcastLeadPayload): LeadRow {
  return {
    id: p.id,
    companyName: p.company_name,
    niche: p.niche,
    domain: p.domain,
    location: p.location,
    platform: p.platform,
    decisionMaker: p.decision_maker || p.owner_name,
    role: p.role,
    linkedInProfile: p.linkedin,
    companyLinkedIn: "",
    emailPattern: p.email_pattern,
    aiGapInsight: p.ai_gap,
    remarks: p.remarks,
    ownerEmail: p.email?.trim() ? p.email : undefined,
  };
}

export interface EmailCampaignProps {
  onBroadcastComplete?: () => void;
  initialSelectedIds?: number[];
}

const EmailCampaign: React.FC<EmailCampaignProps> = ({
  onBroadcastComplete,
  initialSelectedIds,
}) => {
  const location = useLocation();

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>(
    initialSelectedIds ?? [],
  );
  const [templateSelectionMode, setTemplateSelectionMode] = useState<
    "single" | "custom"
  >("single");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const [leadTemplateAssignments, setLeadTemplateAssignments] = useState<
    Record<number, number>
  >({});
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);
  const [sentLeadIds, setSentLeadIds] = useState<Set<number>>(new Set());
  const [attachPortfolio, setAttachPortfolio] = useState(false);
  const [reviewLeadId, setReviewLeadId] = useState<number | null>(null);

  // â”€â”€ Hydrate from storage when switching to this tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const st = location.state as Partial<BroadcastLocationState> | null;
    let payloads: BroadcastLeadPayload[] | null = null;
    if (Array.isArray(st?.broadcastLeads) && st.broadcastLeads.length > 0) {
      payloads = st.broadcastLeads;
      try {
        localStorage.removeItem(BROADCAST_LEADS_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    } else {
      payloads = consumeBroadcastLeadsFromStorage();
    }
    if (!payloads?.length) return;
    const rows = payloads.map(broadcastPayloadToLeadRow);
    setLeads(rows);
    setSelectedLeadIds(rows.map((r) => r.id));
    setGeneratedEmails([]);
    setSentLeadIds(new Set());
    toast.success(`Loaded ${rows.length} lead(s) for broadcast`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // â”€â”€ Queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { data: campaignTemplates = [] } = useQuery<CampaignTemplate[]>({
    queryKey: ["campaignTemplates"],
    queryFn: api.getCampaignTemplates,
    enabled: !!authStorage.getToken(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // â”€â”€ Derived state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const emailByLeadId = useMemo(
    () => new Map(generatedEmails.map((e) => [e.leadId, e])),
    [generatedEmails],
  );

  const templateById = useMemo(
    () => new Map(campaignTemplates.map((t) => [t.id, t])),
    [campaignTemplates],
  );

  const selectedLeads = useMemo(
    () => leads.filter((l) => selectedLeadIds.includes(l.id)),
    [leads, selectedLeadIds],
  );

  const getAssignedTemplate = (
    leadId: number,
  ): CampaignTemplate | undefined => {
    if (templateSelectionMode === "single") {
      return templateById.get(Number(selectedTemplateId));
    }
    const tid = leadTemplateAssignments[leadId] || Number(bulkTemplateId);
    return templateById.get(tid);
  };

  const canGenerate =
    selectedLeads.length > 0 &&
    (templateSelectionMode === "single"
      ? !!selectedTemplateId
      : selectedLeads.every(
          (l) => !!leadTemplateAssignments[l.id] || !!bulkTemplateId,
        ));

  const readyToSend = useMemo(
    () =>
      selectedLeads.filter((l) => {
        if (sentLeadIds.has(l.id)) return false;
        const em = emailByLeadId.get(l.id);
        return !!em && !em.error;
      }),
    [selectedLeads, emailByLeadId, sentLeadIds],
  );

  const reviewEmail =
    reviewLeadId !== null ? (emailByLeadId.get(reviewLeadId) ?? null) : null;

  // â”€â”€ Mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const generateMutation = useMutation({
    mutationFn: async () => {
      const snapshot = leads.filter((l) => selectedLeadIds.includes(l.id));
      const response = await api.generateAiEmails({
        prompt: "",
        leads: snapshot.map((l) => {
          const tpl = getAssignedTemplate(l.id);
          return {
            company_name: l.companyName,
            niche: l.niche,
            domain: l.domain,
            location: l.location,
            platform: l.platform,
            decision_maker: l.decisionMaker,
            role: l.role,
            linkedin_profile: l.linkedInProfile,
            company_linkedin: l.companyLinkedIn,
            email_pattern: l.emailPattern,
            recipient_email: resolveEmailPreview(l),
            ai_gap_insight: l.aiGapInsight,
            remarks: l.remarks,
            template_name: tpl?.name ?? "",
            template_subject: tpl?.subject_template ?? "",
            template_body: tpl?.body_template ?? "",
            template_instructions: tpl?.instructions ?? "",
          };
        }),
      });
      return { items: response.items, snapshot };
    },
    onSuccess: ({ items, snapshot }: any) => {
      const newEmails: GeneratedEmail[] = items.map((item: any) => {
        const lead = snapshot[item.lead_index];
        return {
          leadId: lead?.id ?? -1,
          recipientName: item.recipient_name,
          companyName: item.company_name,
          recipientEmail: item.recipient_email,
          subject: item.subject,
          body: item.body,
          error: item.error,
        };
      });
      setGeneratedEmails((prev) => {
        const map = new Map(prev.map((e) => [e.leadId, e]));
        newEmails.forEach((e: GeneratedEmail) => map.set(e.leadId, e));
        return Array.from(map.values());
      });
      const ok = newEmails.filter((e: GeneratedEmail) => !e.error).length;
      const fail = newEmails.filter((e: GeneratedEmail) => !!e.error).length;
      if (fail > 0) {
        toast.error(`Generated ${ok}, failed ${fail}`);
      } else {
        toast.success(`Generated ${ok} email(s) â€” click Review to inspect`);
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to generate emails");
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const snapshot = [...readyToSend];
      const result = await api.sendAiGeneratedEmails({
        emails: snapshot.map((l, idx) => {
          const em = emailByLeadId.get(l.id)!;
          return {
            lead_index: idx,
            company_id: l.id,
            recipient_name: em.recipientName,
            company_name: em.companyName,
            recipient_email: em.recipientEmail,
            subject: em.subject,
            body: em.body,
          };
        }),
        attach_portfolio: attachPortfolio,
      });
      return { result, snapshot };
    },
    onSuccess: ({ result, snapshot }: any) => {
      setSentLeadIds((prev) => {
        const next = new Set(prev);
        result.items.forEach((item: any) => {
          if (item.success) {
            const lead = snapshot[item.lead_index];
            if (lead) next.add(lead.id);
          }
        });
        return next;
      });
      if (result.failed > 0) {
        const firstError = result.items?.find(
          (item: any) => !item.success,
        )?.error;
        toast.error(
          firstError
            ? `${result.sent} sent, ${result.failed} failed. ${firstError}`
            : `${result.sent} sent, ${result.failed} failed`,
        );
      } else {
        toast.success(`Broadcast completed: ${result.sent} sent`);
        onBroadcastComplete?.();
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to send emails");
    },
  });

  // â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const toggleLead = (id: number) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map((l) => l.id));
    }
  };

  const setTemplateForLead = (leadId: number, templateId: string) => {
    setLeadTemplateAssignments((prev) => {
      const next = { ...prev };
      if (!templateId) {
        delete next[leadId];
      } else {
        next[leadId] = Number(templateId);
      }
      return next;
    });
  };

  const assignBulkTemplate = () => {
    if (!bulkTemplateId) {
      toast.error("Select a template first");
      return;
    }
    const id = Number(bulkTemplateId);
    setLeadTemplateAssignments((prev) => {
      const next = { ...prev };
      selectedLeadIds.forEach((leadId) => {
        next[leadId] = id;
      });
      return next;
    });
    toast.success(`Assigned template to ${selectedLeadIds.length} lead(s)`);
  };

  const updateEmail = (leadId: number, patch: Partial<GeneratedEmail>) => {
    setGeneratedEmails((prev) =>
      prev.map((e) => (e.leadId === leadId ? { ...e, ...patch } : e)),
    );
  };

  const getStatusChip = (lead: LeadRow) => {
    if (sentLeadIds.has(lead.id))
      return <StatusChip tone="green" dot label="Sent" />;
    if (generateMutation.isPending && selectedLeadIds.includes(lead.id))
      return (
        <Box display="flex" alignItems="center" gap={0.5}>
          <CircularProgress size={11} />
          <Typography variant="caption">Generating…</Typography>
        </Box>
      );
    const em = emailByLeadId.get(lead.id);
    if (!em) return <StatusChip tone="default" label="Pending" />;
    if (em.error) return <StatusChip tone="red" dot label="Error" />;
    return <StatusChip tone="brand" dot label="Generated" />;
  };

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <Box>
      <PageHeader
        eyebrow="Pipeline"
        title="Broadcast"
        description="Generate and send personalized emails to your selected leads."
      />

      {/* Template Config */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Template Configuration
        </Typography>
        <FormControl component="fieldset" sx={{ mb: 1.5 }}>
          <FormLabel component="legend" sx={{ fontSize: "0.82rem" }}>
            Mode
          </FormLabel>
          <RadioGroup
            row
            value={templateSelectionMode}
            onChange={(e) =>
              setTemplateSelectionMode(e.target.value as "single" | "custom")
            }
          >
            <FormControlLabel
              value="single"
              control={<Radio size="small" />}
              label="Same template for all leads"
            />
            <FormControlLabel
              value="custom"
              control={<Radio size="small" />}
              label="Per-lead template assignment"
            />
          </RadioGroup>
        </FormControl>

        {campaignTemplates.length === 0 ? (
          <Alert severity="info" sx={{ maxWidth: 480 }}>
            No campaign templates yet â€” create one in the Templates tab first.
          </Alert>
        ) : templateSelectionMode === "single" ? (
          <FormControl size="small" sx={{ minWidth: 320 }}>
            <Select
              displayEmpty
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(String(e.target.value))}
            >
              <MenuItem value="">Select a template</MenuItem>
              {campaignTemplates.map((t) => (
                <MenuItem key={t.id} value={String(t.id)}>
                  {t.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <Select
                displayEmpty
                value={bulkTemplateId}
                onChange={(e) => setBulkTemplateId(String(e.target.value))}
              >
                <MenuItem value="">Select template to assign</MenuItem>
                {campaignTemplates.map((t) => (
                  <MenuItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              size="small"
              onClick={assignBulkTemplate}
              disabled={selectedLeadIds.length === 0}
            >
              Assign to {selectedLeadIds.length} checked
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={() => setLeadTemplateAssignments({})}
            >
              Clear
            </Button>
          </Box>
        )}
      </Paper>

      {/* Action Bar */}
      <Box
        display="flex"
        alignItems="center"
        gap={1.5}
        flexWrap="wrap"
        mb={1.5}
      >
        <Typography variant="body2" color="text.secondary">
          {selectedLeadIds.length} of {leads.length} selected
        </Typography>
        <Button size="small" onClick={toggleAll} disabled={leads.length === 0}>
          {selectedLeadIds.length === leads.length
            ? "Deselect All"
            : "Select All"}
        </Button>
        <Box flex={1} />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={attachPortfolio}
              onChange={(e) => setAttachPortfolio(e.target.checked)}
            />
          }
          label={
            <Typography variant="body2">Attach portfolio files</Typography>
          }
        />
        <Button
          variant="outlined"
          disabled={!canGenerate || generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
          startIcon={
            generateMutation.isPending ? (
              <CircularProgress size={16} />
            ) : undefined
          }
        >
          {generateMutation.isPending
            ? "Generatingâ€¦"
            : `Generate Emails (${selectedLeadIds.length})`}
        </Button>
        <Button
          variant="contained"
          color="success"
          startIcon={
            sendMutation.isPending ? <CircularProgress size={16} /> : <Send />
          }
          disabled={readyToSend.length === 0 || sendMutation.isPending}
          onClick={() => sendMutation.mutate()}
        >
          {sendMutation.isPending
            ? "Sendingâ€¦"
            : `Send Selected (${readyToSend.length})`}
        </Button>
      </Box>

      {/* Leads Table */}
      <Paper variant="outlined">
        <TableContainer sx={{ maxHeight: 560, overflowX: "auto" }}>
          <Table
            stickyHeader
            size="small"
            sx={{ tableLayout: "fixed", width: "100%", minWidth: 650 }}
          >
            <TableHead>
              <TableRow>
                <TableCell
                  padding="checkbox"
                  sx={{ width: 42, bgcolor: colors.bgSunken }}
                >
                  <Checkbox
                    size="small"
                    indeterminate={
                      selectedLeadIds.length > 0 &&
                      selectedLeadIds.length < leads.length
                    }
                    checked={
                      leads.length > 0 &&
                      selectedLeadIds.length === leads.length
                    }
                    onChange={toggleAll}
                  />
                </TableCell>
                {(
                  [
                    ["Company", "19%"],
                    ["Decision Maker", "14%"],
                    ["Role", "9%"],
                    ["Niche", "9%"],
                    ["Location", "10%"],
                    ["Email", "16%"],
                    ["Status", "11%"],
                    ["Action", "10%"],
                  ] as [string, string][]
                ).map(([label, width]) => (
                  <TableCell
                    key={label}
                    sx={{
                      bgcolor: colors.bgSunken,
                      fontWeight: 600,
                      fontSize: "0.72rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: colors.ink3,
                      width,
                    }}
                  >
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} sx={{ p: 0, border: 0 }}>
                    <EmptyState
                      icon={<Send />}
                      tone="brand"
                      title="No leads queued"
                      description="Go to Leads, select rows, and click Broadcast to selected."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => {
                  const isSelected = selectedLeadIds.includes(lead.id);
                  const em = emailByLeadId.get(lead.id);
                  const hasEmail = !!em && !em.error;
                  const isSent = sentLeadIds.has(lead.id);
                  const cellSx = {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 0,
                    fontSize: "0.78rem",
                    py: 0.75,
                    px: 1,
                  };
                  return (
                    <TableRow
                      key={lead.id}
                      hover
                      selected={isSelected}
                      onClick={() => toggleLead(lead.id)}
                      sx={{
                        cursor: "pointer",
                        height: 44,
                        opacity: isSent ? 0.6 : 1,
                        "&.Mui-selected": { bgcolor: "primary.50" },
                        "&.Mui-selected:hover": { bgcolor: "primary.100" },
                      }}
                    >
                      <TableCell
                        padding="checkbox"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          size="small"
                          checked={isSelected}
                          onChange={() => toggleLead(lead.id)}
                        />
                      </TableCell>
                      <TableCell sx={cellSx}>{lead.companyName}</TableCell>
                      <TableCell sx={cellSx}>
                        {lead.decisionMaker || "â€”"}
                      </TableCell>
                      <TableCell sx={cellSx}>{lead.role || "â€”"}</TableCell>
                      <TableCell sx={cellSx}>{lead.niche || "â€”"}</TableCell>
                      <TableCell sx={cellSx}>
                        {lead.location || "â€”"}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        {resolveEmailPreview(lead) || "â€”"}
                      </TableCell>
                      <TableCell sx={{ py: 0.5, px: 1 }}>
                        {getStatusChip(lead)}
                      </TableCell>
                      <TableCell
                        sx={{ py: 0.5, px: 1 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {hasEmail && !isSent && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Visibility />}
                            onClick={() => setReviewLeadId(lead.id)}
                            sx={{ fontSize: "0.7rem", py: 0.25 }}
                          >
                            Review
                          </Button>
                        )}
                        {em?.error && (
                          <Typography
                            variant="caption"
                            color="error"
                            title={em.error}
                            sx={{
                              display: "block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 90,
                            }}
                          >
                            {em.error}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Per-lead template assignment panel (custom mode) */}
      {templateSelectionMode === "custom" && selectedLeads.length > 0 && (
        <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Per-lead template assignments ({selectedLeads.length} selected)
          </Typography>
          <TableContainer sx={{ maxHeight: 260 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Company</TableCell>
                  <TableCell>Template</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>{lead.companyName}</TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <FormControl fullWidth size="small">
                        <Select
                          displayEmpty
                          value={
                            leadTemplateAssignments[lead.id]
                              ? String(leadTemplateAssignments[lead.id])
                              : bulkTemplateId
                          }
                          onChange={(e) =>
                            setTemplateForLead(lead.id, String(e.target.value))
                          }
                        >
                          <MenuItem value="">No template</MenuItem>
                          {campaignTemplates.map((t) => (
                            <MenuItem key={t.id} value={String(t.id)}>
                              {t.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Review Email Dialog */}
      <Dialog
        open={reviewEmail !== null}
        onClose={() => setReviewLeadId(null)}
        maxWidth="md"
        fullWidth
      >
        {reviewEmail && (
          <>
            <DialogTitle sx={{ pb: 0.5 }}>
              Review Email â€” {reviewEmail.companyName}
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                To: {reviewEmail.recipientName || "â€”"} &lt;
                {reviewEmail.recipientEmail}&gt;
              </Typography>
            </DialogTitle>
            <DialogContent dividers>
              {reviewEmail.error && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {reviewEmail.error}
                </Alert>
              )}
              <TextField
                fullWidth
                label="Subject"
                value={reviewEmail.subject}
                onChange={(e) =>
                  updateEmail(reviewEmail.leadId, { subject: e.target.value })
                }
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                multiline
                minRows={10}
                label="Email Body"
                value={reviewEmail.body}
                onChange={(e) =>
                  updateEmail(reviewEmail.leadId, { body: e.target.value })
                }
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setReviewLeadId(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default EmailCampaign;
