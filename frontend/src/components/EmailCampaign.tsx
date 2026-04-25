import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Checkbox,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import { AttachFile, CheckCircle, Email, Send } from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";

interface Contact {
  id: number;
  role: string;
  name: string | null;
  email: string | null;
}

interface Company {
  id: number;
  name: string;
  website: string;
  status: string;
  niche: string | null;
  location: string | null;
  address: string | null;
  contacts: Contact[];
}

interface CampaignTemplate {
  id: number;
  name: string;
  subject_template: string;
  body_template: string;
  attach_portfolio: boolean;
}

interface SendResult {
  message: string;
  sent: number;
  failed: number;
  errors: string[];
}

const STEPS = ["Select Leads", "Choose Template", "Review & Send"];

interface EmailCampaignProps {
  initialSelectedIds?: number[];
}

const EmailCampaign: React.FC<EmailCampaignProps> = ({
  initialSelectedIds = [],
}) => {
  const queryClient = useQueryClient();
  const [activeStep, setActiveStep] = useState(
    initialSelectedIds.length > 0 ? 1 : 0,
  );
  const [selectedLeads, setSelectedLeads] =
    useState<number[]>(initialSelectedIds);
  const [selectedTemplate, setSelectedTemplate] =
    useState<CampaignTemplate | null>(null);
  const [attachPortfolio, setAttachPortfolio] = useState(false);
  const [resultDialog, setResultDialog] = useState<SendResult | null>(null);

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => api.getCompanies(),
  });

  const { data: templates = [] } = useQuery<CampaignTemplate[]>({
    queryKey: ["campaignTemplates"],
    queryFn: api.getCampaignTemplates,
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      api.sendBulkEmails({
        company_ids: selectedLeads,
        campaign_template_id: selectedTemplate!.id,
        attach_portfolio: attachPortfolio || selectedTemplate!.attach_portfolio,
      }),
    onSuccess: (data: SendResult) => {
      setResultDialog(data);
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || "Send failed";
      toast.error(detail);
    },
  });

  const sendableCompanies = companies.filter((c) => {
    const primaryContact =
      c.contacts.find((ct) => ct.role === "CEO") ||
      c.contacts.find((ct) => ct.role === "CTO") ||
      c.contacts.find((ct) => ct.role === "CFO") ||
      c.contacts[0];
    return primaryContact?.email;
  });

  const toggleLead = (id: number) => {
    setSelectedLeads((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectedCompanyDetails = companies.filter((c) =>
    selectedLeads.includes(c.id),
  );
  const companiesWithEmail = selectedCompanyDetails.filter((c) => {
    const p = c.contacts.find((ct) => ct.role === "CEO") || c.contacts[0];
    return p?.email;
  });
  const companiesWithoutEmail = selectedCompanyDetails.filter((c) => {
    const p = c.contacts.find((ct) => ct.role === "CEO") || c.contacts[0];
    return !p?.email;
  });

  const canProceedStep0 = selectedLeads.length > 0;
  const canProceedStep1 = selectedTemplate !== null;

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 4 }}>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Email Campaign
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Select leads, choose a template, then send AI-personalised outreach
        emails.
      </Typography>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step 0 — Select Leads */}
      {activeStep === 0 && (
        <Box>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={2}
          >
            <Typography variant="subtitle1">
              Select leads to contact ({selectedLeads.length} selected)
            </Typography>
            <Box display="flex" gap={1}>
              <Button
                size="small"
                onClick={() =>
                  setSelectedLeads(sendableCompanies.map((c) => c.id))
                }
              >
                Select all with email
              </Button>
              <Button size="small" onClick={() => setSelectedLeads([])}>
                Clear
              </Button>
            </Box>
          </Box>

          {sendableCompanies.length === 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              No leads with email addresses found. Run scraping first to enrich
              company data.
            </Alert>
          )}

          <Grid container spacing={1.5}>
            {sendableCompanies.map((company) => {
              const primary =
                company.contacts.find((c) => c.role === "CEO") ||
                company.contacts.find((c) => c.role === "CTO") ||
                company.contacts[0];
              const isSelected = selectedLeads.includes(company.id);
              return (
                <Grid item xs={12} sm={6} md={4} key={company.id}>
                  <Card
                    variant="outlined"
                    sx={{
                      cursor: "pointer",
                      borderColor: isSelected ? "primary.main" : undefined,
                      bgcolor: isSelected ? "primary.50" : undefined,
                    }}
                    onClick={() => toggleLead(company.id)}
                  >
                    <CardActionArea component="div">
                      <CardContent sx={{ py: 1.5 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Checkbox
                            checked={isSelected}
                            size="small"
                            onChange={() => toggleLead(company.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Box>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {company.name}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {primary?.name || "No name"} · {primary?.email}
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          <Box mt={3} display="flex" justifyContent="flex-end">
            <Button
              variant="contained"
              disabled={!canProceedStep0}
              onClick={() => setActiveStep(1)}
            >
              Next: Choose Template
            </Button>
          </Box>
        </Box>
      )}

      {/* Step 1 — Choose Template */}
      {activeStep === 1 && (
        <Box>
          <Typography variant="subtitle1" mb={2}>
            Choose a campaign template to use
          </Typography>

          {templates.length === 0 && (
            <Alert severity="warning">
              No campaign templates found. Go to the Templates tab to create one
              first.
            </Alert>
          )}

          <Grid container spacing={2}>
            {templates.map((tmpl) => {
              const isSelected = selectedTemplate?.id === tmpl.id;
              return (
                <Grid item xs={12} md={6} key={tmpl.id}>
                  <Card
                    variant="outlined"
                    sx={{
                      cursor: "pointer",
                      borderColor: isSelected ? "primary.main" : undefined,
                      borderWidth: isSelected ? 2 : 1,
                    }}
                    onClick={() => setSelectedTemplate(tmpl)}
                  >
                    <CardContent>
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="flex-start"
                      >
                        <Typography variant="subtitle1" fontWeight={600}>
                          {tmpl.name}
                        </Typography>
                        {isSelected && <CheckCircle color="primary" />}
                      </Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        gutterBottom
                      >
                        Subject: {tmpl.subject_template}
                      </Typography>
                      {tmpl.attach_portfolio && (
                        <Chip
                          icon={<AttachFile />}
                          label="Portfolio"
                          size="small"
                          variant="outlined"
                        />
                      )}
                      <Divider sx={{ my: 1 }} />
                      <Typography
                        variant="caption"
                        sx={{
                          whiteSpace: "pre-wrap",
                          color: "text.secondary",
                          maxHeight: 80,
                          overflow: "hidden",
                          display: "block",
                        }}
                      >
                        {tmpl.body_template}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          <Box mt={3} display="flex" justifyContent="space-between">
            <Button onClick={() => setActiveStep(0)}>Back</Button>
            <Button
              variant="contained"
              disabled={!canProceedStep1}
              onClick={() => setActiveStep(2)}
            >
              Next: Review
            </Button>
          </Box>
        </Box>
      )}

      {/* Step 2 — Review & Send */}
      {activeStep === 2 && selectedTemplate && (
        <Box>
          <Grid container spacing={3}>
            <Grid item xs={12} md={5}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Summary
                </Typography>
                <List dense disablePadding>
                  <ListItem disableGutters>
                    <ListItemText
                      primary="Template"
                      secondary={selectedTemplate.name}
                    />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText
                      primary="Subject template"
                      secondary={selectedTemplate.subject_template}
                    />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText
                      primary="Recipients"
                      secondary={`${companiesWithEmail.length} leads with email addresses`}
                    />
                  </ListItem>
                  {companiesWithoutEmail.length > 0 && (
                    <ListItem disableGutters>
                      <ListItemText
                        primary={`${companiesWithoutEmail.length} leads skipped`}
                        secondary="No email address — they won't receive an email"
                        secondaryTypographyProps={{ color: "warning.main" }}
                      />
                    </ListItem>
                  )}
                </List>

                <Divider sx={{ my: 1.5 }} />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={
                        attachPortfolio || selectedTemplate.attach_portfolio
                      }
                      onChange={(e) => setAttachPortfolio(e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2">
                        Attach portfolio files
                      </Typography>
                      {selectedTemplate.attach_portfolio && (
                        <Typography variant="caption" color="text.secondary">
                          (enabled by default in this template)
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </Paper>
            </Grid>

            <Grid item xs={12} md={7}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Recipients ({selectedLeads.length})
                </Typography>
                <Box sx={{ maxHeight: 280, overflowY: "auto" }}>
                  {selectedCompanyDetails.map((c) => {
                    const p =
                      c.contacts.find((ct) => ct.role === "CEO") ||
                      c.contacts[0];
                    const hasEmail = !!p?.email;
                    return (
                      <Box
                        key={c.id}
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        py={0.5}
                        borderBottom="1px solid"
                        borderColor="divider"
                      >
                        <Box>
                          <Typography variant="body2">{c.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {p?.name || "—"} · {p?.email || "No email"}
                          </Typography>
                        </Box>
                        <Chip
                          label={hasEmail ? "will send" : "skip"}
                          size="small"
                          color={hasEmail ? "success" : "default"}
                          variant="outlined"
                        />
                      </Box>
                    );
                  })}
                </Box>
              </Paper>
            </Grid>
          </Grid>

          <Alert severity="info" sx={{ mt: 2 }}>
            Each email will be AI-personalised using the template + that
            company's scraped data. This may take a moment.
          </Alert>

          <Box mt={3} display="flex" justifyContent="space-between">
            <Button onClick={() => setActiveStep(1)}>Back</Button>
            <Button
              variant="contained"
              color="success"
              size="large"
              startIcon={<Send />}
              disabled={
                sendMutation.isPending || companiesWithEmail.length === 0
              }
              onClick={() => sendMutation.mutate()}
            >
              {sendMutation.isPending
                ? "Sending…"
                : `Send to ${companiesWithEmail.length} lead${companiesWithEmail.length !== 1 ? "s" : ""}`}
            </Button>
          </Box>
        </Box>
      )}

      {/* Result dialog */}
      <Dialog
        open={!!resultDialog}
        onClose={() => setResultDialog(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <Email color="primary" />
            Send Complete
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {resultDialog && (
            <Box>
              <Box display="flex" gap={2} mb={2}>
                <Chip label={`${resultDialog.sent} sent`} color="success" />
                {resultDialog.failed > 0 && (
                  <Chip label={`${resultDialog.failed} failed`} color="error" />
                )}
              </Box>
              {resultDialog.errors.length > 0 && (
                <>
                  <Typography variant="subtitle2" gutterBottom>
                    Errors:
                  </Typography>
                  {resultDialog.errors.map((e, i) => (
                    <Alert severity="warning" key={i} sx={{ mb: 0.5, py: 0 }}>
                      {e}
                    </Alert>
                  ))}
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => {
              setResultDialog(null);
              setActiveStep(0);
              setSelectedLeads([]);
              setSelectedTemplate(null);
            }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default EmailCampaign;
