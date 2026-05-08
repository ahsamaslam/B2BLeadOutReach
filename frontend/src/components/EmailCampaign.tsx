import React, { useLayoutEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { ExpandMore, Send } from "@mui/icons-material";
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
  /** When set (e.g. from Upload Leads broadcast payload), used for email preview. */
  ownerEmail?: string;
};

type GeneratedEmail = {
  leadIndex: number;
  recipientName: string;
  companyName: string;
  recipientEmail: string;
  subject: string;
  body: string;
  approved: boolean;
  error?: string;
};

const STEPS = [
  "Select Leads & Templates",
  "Review & Approve",
  "Broadcast & Send",
];

const TABLE_COLUMNS = [
  "Company Name",
  "Niche",
  "Domain",
  "Location",
  "Platform",
  "Decision Maker",
  "Role",
  "Email",
  "AI Gap Insight",
  "Remarks",
] as const;

const BROADCAST_COLUMN_WIDTHS: Record<(typeof TABLE_COLUMNS)[number], string> = {
  "Company Name": "13%",
  Niche: "9%",
  Domain: "10%",
  Location: "10%",
  Platform: "9%",
  "Decision Maker": "13%",
  Role: "7%",
  Email: "14%",
  "AI Gap Insight": "10%",
  Remarks: "5%",
};

const compactCellSx = {
  py: 0.75,
  px: 1,
  maxWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

const headerCellSx = {
  ...compactCellSx,
  bgcolor: "grey.100",
  color: "text.primary",
  fontWeight: 700,
  fontSize: "0.72rem",
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  borderBottom: "1px solid",
  borderColor: "divider",
};

const checkboxCellSx = {
  py: 0.5,
  px: 0.5,
  width: 42,
  maxWidth: 42,
  textAlign: "center",
  verticalAlign: "middle",
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
  const parts = lead.decisionMaker.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  if (!domain || !first) return "";
  if (pattern.includes("first.last") && last) return `${first}.${last}@${domain}`;
  if (pattern.includes("first_last") && last) return `${first}_${last}@${domain}`;
  if (pattern.includes("firstlast") && last) return `${first}${last}@${domain}`;
  if (pattern.includes("f.last") && last) return `${first.slice(0, 1)}.${last}@${domain}`;
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
  /** Called after a broadcast send request completes successfully (clears parent state). */
  onBroadcastComplete?: () => void;
}

const EmailCampaign: React.FC<EmailCampaignProps> = ({
  onBroadcastComplete,
}) => {
  const location = useLocation();
  const [activeStep, setActiveStep] = useState(0);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const prompt = "";
  const [templateSelectionMode, setTemplateSelectionMode] = useState<
    "single" | "custom"
  >("single");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const [leadTemplateAssignments, setLeadTemplateAssignments] = useState<
    Record<number, number>
  >({});
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);
  const [attachPortfolio, setAttachPortfolio] = useState(false);

  useLayoutEffect(() => {
    const st = location.state as Partial<BroadcastLocationState> | null;
    let payloads: BroadcastLeadPayload[] | null = null;
    if (Array.isArray(st?.broadcastLeads) && st.broadcastLeads.length > 0) {
      payloads = st.broadcastLeads;
      console.log(
        "[EmailCampaign] hydrate from router state, length:",
        payloads.length,
      );
      try {
        localStorage.removeItem(BROADCAST_LEADS_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    } else {
      payloads = consumeBroadcastLeadsFromStorage();
      console.log("[EmailCampaign] consumeBroadcastLeadsFromStorage:", payloads);
    }
    if (!payloads?.length) {
      console.log("[EmailCampaign] no broadcast payloads");
      return;
    }
    const rows = payloads.map(broadcastPayloadToLeadRow);
    console.log("[EmailCampaign] mapped LeadRows:", rows);
    setLeads(rows);
    setSelectedLeadIds(rows.map((r) => r.id));
    setLeadTemplateAssignments({});
    setGeneratedEmails([]);
    setActiveStep(0);
    toast.success(`Loaded ${rows.length} lead(s) for broadcast`);
  }, [location.key]);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    enabled: !!authStorage.getToken(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: campaignTemplates = [] } = useQuery<CampaignTemplate[]>({
    queryKey: ["campaignTemplates"],
    queryFn: api.getCampaignTemplates,
    enabled: !!authStorage.getToken(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const checkedLeads = useMemo(
    () => leads.filter((lead) => selectedLeadIds.includes(lead.id)),
    [leads, selectedLeadIds],
  );

  const selectedLeads = useMemo(
    () => {
      if (templateSelectionMode === "custom") {
        const assignedIds = new Set(
          Object.keys(leadTemplateAssignments).map((id) => Number(id)),
        );
        if (bulkTemplateId) {
          selectedLeadIds.forEach((leadId) => assignedIds.add(leadId));
        }
        return leads.filter((lead) => assignedIds.has(lead.id));
      }
      return checkedLeads;
    },
    [
      bulkTemplateId,
      checkedLeads,
      leadTemplateAssignments,
      leads,
      selectedLeadIds,
      templateSelectionMode,
    ],
  );

  const activeTemplates = useMemo(() => {
    if (templateSelectionMode === "single") {
      const id = Number(selectedTemplateId);
      return campaignTemplates.filter((template) => template.id === id);
    }
    if (templateSelectionMode === "custom") {
      const ids = new Set(Object.values(leadTemplateAssignments));
      return campaignTemplates.filter((template) => ids.has(template.id));
    }
    return [];
  }, [
    campaignTemplates,
    leadTemplateAssignments,
    selectedTemplateId,
    templateSelectionMode,
  ]);

  const templateById = useMemo(
    () => new Map(campaignTemplates.map((template) => [template.id, template])),
    [campaignTemplates],
  );

  const selectableLeadIds = useMemo(
    () =>
      leads
        .filter((l) => !!resolveEmailPreview(l))
        .map((l) => l.id),
    [leads],
  );

  const approvedEmails = generatedEmails.filter((e) => e.approved);

  const canGenerateEmails =
    selectedLeads.length > 0 &&
    (templateSelectionMode === "single"
      ? !!selectedTemplateId
      : selectedLeads.every(
          (lead) => !!leadTemplateAssignments[lead.id] || !!bulkTemplateId,
        ));

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.generateAiEmails({
        prompt,
        leads: selectedLeads.map((l) => {
          const assignedTemplate =
            templateSelectionMode === "custom"
              ? templateById.get(leadTemplateAssignments[l.id] || Number(bulkTemplateId))
              : activeTemplates[0];
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
            template_name: assignedTemplate?.name ?? "",
            template_subject: assignedTemplate?.subject_template ?? "",
            template_body: assignedTemplate?.body_template ?? "",
          };
        }),
      });
      return response.items;
    },
    onSuccess: (items) => {
      setGeneratedEmails(
        items.map((item) => ({
          leadIndex: item.lead_index,
          recipientName: item.recipient_name,
          companyName: item.company_name,
          recipientEmail: item.recipient_email,
          subject: item.subject,
          body: item.body,
          approved: false,
          error: item.error,
        })),
      );
      setActiveStep(1);
      toast.success("AI emails generated");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to generate emails");
    },
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      api.sendAiGeneratedEmails({
        emails: approvedEmails.map((e) => ({
          lead_index: e.leadIndex,
          recipient_name: e.recipientName,
          company_name: e.companyName,
          recipient_email: e.recipientEmail,
          subject: e.subject,
          body: e.body,
        })),
        attach_portfolio: attachPortfolio,
      }),
    onSuccess: (result) => {
      setGeneratedEmails((prev) =>
        prev.map((item) => {
          const status = result.items.find((x) => x.lead_index === item.leadIndex);
          if (!status) return item;
          return {
            ...item,
            error: status.success ? undefined : status.error || "Send failed",
          };
        }),
      );
      if (result.failed > 0) {
        if (result.sent > 0) {
          toast.error(`Broadcast partial: ${result.sent} sent, ${result.failed} failed`);
        } else {
          toast.error(`Broadcast failed: ${result.failed} email(s) not sent`);
        }
      } else {
        toast.success(`Broadcast completed: ${result.sent} sent`);
        onBroadcastComplete?.();
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to send emails");
    },
  });

  const toggleLead = (id: number) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
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
      toast.error("Select a template to assign");
      return;
    }
    if (selectedLeadIds.length === 0) {
      toast.error("Select at least one lead to assign");
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
    toast.success(`Assigned template to ${selectedLeadIds.length} selected lead(s)`);
  };

  const updateGeneratedEmail = (
    leadIndex: number,
    patch: Partial<GeneratedEmail>,
  ) => {
    setGeneratedEmails((prev) =>
      prev.map((item) =>
        item.leadIndex === leadIndex ? { ...item, ...patch } : item,
      ),
    );
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 3, mb: 5 }}>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Broadcast Emails
      </Typography>
      <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {selectedLeads.length > 0 && activeStep >= 1 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Selected recipients ({selectedLeads.length})
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Same leads you chose when uploading/selecting recipients — visible until you send on the final step.
          </Typography>
          <TableContainer sx={{ maxHeight: 260 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Company</TableCell>
                  <TableCell>Decision maker</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Email (preview)</TableCell>
                  {templateSelectionMode === "custom" && <TableCell>Template</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>{lead.companyName}</TableCell>
                    <TableCell>{lead.decisionMaker || "—"}</TableCell>
                    <TableCell>{lead.role || "—"}</TableCell>
                    <TableCell>{resolveEmailPreview(lead) || "—"}</TableCell>
                    {templateSelectionMode === "custom" && (
                      <TableCell sx={{ minWidth: 220 }}>
                        <FormControl fullWidth size="small">
                          <Select
                            displayEmpty
                            value={
                              leadTemplateAssignments[lead.id]
                                ? String(leadTemplateAssignments[lead.id])
                                : ""
                            }
                            onChange={(event) =>
                              setTemplateForLead(lead.id, String(event.target.value))
                            }
                          >
                            <MenuItem value="">No template</MenuItem>
                            {campaignTemplates.map((template) => (
                              <MenuItem key={template.id} value={String(template.id)}>
                                {template.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {activeStep === 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          {!settings?.values?.ANTHROPIC_API_KEY && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              AI API key is not configured. Go to <strong>Settings</strong> and save your
              Anthropic API key once, then return here.
            </Alert>
          )}
          {leads.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Click rows below like Gmail to select one, all, or some leads. Then
              assign templates to the selected group and generate emails.
            </Alert>
          )}
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: "grey.50" }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Template Selection
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Use one template for everyone, or select a group of rows below and
              assign a template to that selected group.
            </Typography>
            <FormControl component="fieldset" sx={{ mb: 2 }}>
              <FormLabel component="legend">Selection Mode</FormLabel>
              <RadioGroup
                row
                value={templateSelectionMode}
                onChange={(event) =>
                  setTemplateSelectionMode(event.target.value as "single" | "custom")
                }
              >
                <FormControlLabel
                  value="single"
                  control={<Radio size="small" />}
                  label="Single Template for All Leads"
                />
                <FormControlLabel
                  value="custom"
                  control={<Radio size="small" />}
                  label="Select Leads and Assign Templates"
                />
              </RadioGroup>
            </FormControl>

            {campaignTemplates.length === 0 ? (
              <Alert severity="info">No campaign templates found.</Alert>
            ) : templateSelectionMode === "single" ? (
              <FormControl fullWidth size="small">
                <Select
                  displayEmpty
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(String(event.target.value))}
                >
                  <MenuItem value="">Select template for all selected leads</MenuItem>
                  {campaignTemplates.map((template) => (
                    <MenuItem key={template.id} value={String(template.id)}>
                      {template.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <Box>
                <Box
                  display="flex"
                  gap={1}
                  flexWrap="wrap"
                  alignItems="center"
                  sx={{ mb: 1 }}
                >
                  <FormControl size="small" sx={{ minWidth: 260, flex: "1 1 260px" }}>
                    <Select
                      displayEmpty
                      value={bulkTemplateId}
                      onChange={(event) => setBulkTemplateId(String(event.target.value))}
                    >
                      <MenuItem value="">Select template for checked rows</MenuItem>
                      {campaignTemplates.map((template) => (
                        <MenuItem key={template.id} value={String(template.id)}>
                          {template.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="contained"
                    onClick={assignBulkTemplate}
                    disabled={selectedLeadIds.length === 0}
                  >
                    Assign to {selectedLeadIds.length} Checked
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => setLeadTemplateAssignments({})}
                    disabled={Object.keys(leadTemplateAssignments).length === 0}
                  >
                    Clear Assignments
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  After assigning a template to one group, select another group in
                  the table and assign a different template.
                </Typography>
              </Box>
            )}
          </Paper>
          <Box display="flex" justifyContent="flex-end" alignItems="center" mb={2}>
            <Box display="flex" gap={1}>
              <Button onClick={() => setSelectedLeadIds(selectableLeadIds)}>
                Select All With Email
              </Button>
              <Button onClick={() => setSelectedLeadIds([])}>Clear</Button>
            </Box>
          </Box>

          <Typography variant="body2" color="text.secondary" mb={1}>
            {templateSelectionMode === "custom"
              ? `${selectedLeadIds.length} checked, ${selectedLeads.length} ready for broadcast`
              : `${selectedLeadIds.length} selected`}
          </Typography>

          <TableContainer sx={{ maxHeight: 480, overflowX: "hidden", width: "100%" }}>
            <Table
              stickyHeader
              size="small"
              sx={{
                tableLayout: "fixed",
                width: "100%",
                "& .MuiTableCell-root": {
                  fontSize: "0.75rem",
                  lineHeight: 1.35,
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ ...checkboxCellSx, bgcolor: "grey.100" }} />
                  {TABLE_COLUMNS.map((c) => (
                    <TableCell
                      key={c}
                      title={c}
                      align="left"
                      sx={{ width: BROADCAST_COLUMN_WIDTHS[c], ...headerCellSx }}
                    >
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {leads.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={TABLE_COLUMNS.length + 1}
                      align="center"
                      sx={{ py: 4 }}
                    >
                      <Typography color="text.secondary">
                        Go to <strong>Upload Leads</strong>, select rows, and click{" "}
                        <strong>Broadcast to selected</strong>.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  leads.map((lead) => {
                    const isSelected = selectedLeadIds.includes(lead.id);
                    const cells: Record<(typeof TABLE_COLUMNS)[number], string> = {
                      "Company Name": lead.companyName,
                      Niche: lead.niche,
                      Domain: lead.domain,
                      Location: lead.location,
                      Platform: lead.platform,
                      "Decision Maker": lead.decisionMaker,
                      Role: lead.role,
                      Email: resolveEmailPreview(lead),
                      "AI Gap Insight": lead.aiGapInsight,
                      Remarks: lead.remarks,
                    };
                    return (
                    <TableRow
                      key={lead.id}
                      hover
                      selected={isSelected}
                      onClick={() => toggleLead(lead.id)}
                      sx={{
                        height: 42,
                        cursor: "pointer",
                        transition: "background-color 120ms ease",
                        "&:hover": {
                          bgcolor: "action.hover",
                        },
                        "&.Mui-selected": {
                          bgcolor: "primary.50",
                        },
                        "&.Mui-selected:hover": {
                          bgcolor: "primary.100",
                        },
                      }}
                    >
                      <TableCell padding="checkbox" sx={checkboxCellSx}>
                        <Checkbox
                          size="small"
                          checked={isSelected}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleLead(lead.id)}
                          inputProps={{ "aria-label": `Select ${lead.companyName || "lead"}` }}
                          sx={{
                            p: 0.25,
                            verticalAlign: "middle",
                          }}
                        />
                      </TableCell>
                      {TABLE_COLUMNS.map((column) => (
                        <TableCell
                          key={column}
                          title={cells[column] || ""}
                          sx={{ width: BROADCAST_COLUMN_WIDTHS[column], ...compactCellSx }}
                        >
                          {cells[column]}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Box mt={2} display="flex" justifyContent="flex-end">
            <Button
              variant="contained"
              disabled={!canGenerateEmails || generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
              startIcon={
                generateMutation.isPending ? <CircularProgress size={16} /> : undefined
              }
            >
              {generateMutation.isPending ? "Generating..." : "Generate Emails"}
            </Button>
          </Box>
        </Paper>
      )}

      {activeStep === 1 && (
        <Box>
          {generatedEmails.map((email) => (
            <Accordion key={email.leadIndex} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box>
                  <Typography variant="subtitle2">
                    {email.recipientName || "Unknown"} · {email.companyName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {email.recipientEmail || "No recipient email"}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {email.error && <Alert severity="warning" sx={{ mb: 2 }}>{email.error}</Alert>}
                <TextField
                  fullWidth
                  label="Subject Line"
                  value={email.subject}
                  onChange={(e) =>
                    updateGeneratedEmail(email.leadIndex, { subject: e.target.value })
                  }
                  sx={{ mb: 2 }}
                />
                <TextField
                  fullWidth
                  multiline
                  minRows={6}
                  label="Email Body"
                  value={email.body}
                  onChange={(e) =>
                    updateGeneratedEmail(email.leadIndex, { body: e.target.value })
                  }
                  sx={{ mb: 2 }}
                />
                <Button
                  variant={email.approved ? "contained" : "outlined"}
                  onClick={() =>
                    updateGeneratedEmail(email.leadIndex, { approved: !email.approved })
                  }
                  disabled={!email.subject || !email.body || !email.recipientEmail}
                >
                  {email.approved ? "Approved" : "Approve"}
                </Button>
              </AccordionDetails>
            </Accordion>
          ))}

          <Paper sx={{ p: 2, mb: 2, bgcolor: "info.50", borderColor: "info.200", border: "1px solid" }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={attachPortfolio}
                  onChange={(e) => setAttachPortfolio(e.target.checked)}
                />
              }
              label="Attach portfolio files to emails"
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4, mt: 0.5 }}>
              Include any uploaded portfolio files (PDF, DOCX, etc.) with each email
            </Typography>
          </Paper>

          <Box mt={2} display="flex" justifyContent="space-between">
            <Button onClick={() => setActiveStep(0)}>Back</Button>
            <Box display="flex" gap={1}>
              <Button
                onClick={() =>
                  setGeneratedEmails((prev) =>
                    prev.map((e) => ({
                      ...e,
                      approved: !!e.subject && !!e.body && !!e.recipientEmail,
                    })),
                  )
                }
              >
                Approve All
              </Button>
              <Button
                variant="contained"
                onClick={() => setActiveStep(2)}
                disabled={approvedEmails.length === 0}
              >
                Next
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {activeStep === 2 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Approved Emails ({approvedEmails.length})
          </Typography>
          {approvedEmails.map((email) => (
            <Box key={email.leadIndex} mb={2} p={2} border="1px solid" borderColor="divider">
              <Typography variant="body2" fontWeight={600}>
                {email.recipientName || "Unknown"} · {email.companyName}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                {email.recipientEmail}
              </Typography>
              <TextField
                fullWidth
                size="small"
                label="Subject"
                value={email.subject}
                onChange={(e) =>
                  updateGeneratedEmail(email.leadIndex, { subject: e.target.value })
                }
                sx={{ mb: 1 }}
              />
              <TextField
                fullWidth
                multiline
                minRows={4}
                label="Body"
                value={email.body}
                onChange={(e) =>
                  updateGeneratedEmail(email.leadIndex, { body: e.target.value })
                }
              />
              {email.error && <Alert severity="error" sx={{ mt: 1 }}>{email.error}</Alert>}
            </Box>
          ))}

          <Paper sx={{ p: 2, mb: 2, bgcolor: "info.50", borderColor: "info.200", border: "1px solid" }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Email Settings
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={attachPortfolio}
                  onChange={(e) => setAttachPortfolio(e.target.checked)}
                />
              }
              label="Attach portfolio files to emails"
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4 }}>
              Include any uploaded portfolio files (PDF, DOCX, etc.) with each email
            </Typography>
          </Paper>

          <Box mt={2} display="flex" justifyContent="space-between">
            <Button onClick={() => setActiveStep(1)}>Back</Button>
            <Button
              variant="contained"
              color="success"
              startIcon={sendMutation.isPending ? <CircularProgress size={16} /> : <Send />}
              onClick={() => sendMutation.mutate()}
              disabled={approvedEmails.length === 0 || sendMutation.isPending}
            >
              {sendMutation.isPending ? "Sending..." : "Send All"}
            </Button>
          </Box>
        </Paper>
      )}
    </Container>
  );
};

export default EmailCampaign;
