import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  LinearProgress,
} from "@mui/material";
import { Upload, PlayArrow, CheckCircle, Email } from "@mui/icons-material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";

interface Company {
  id: number;
  name: string;
  website: string;
  status: string;
  company_info?: string;
  projects?: string;
  news?: string;
  created_at: string;
  contacts: Contact[];
  scrape_metadata?: {
    source: string;
    local_pages_scraped: number;
    used_perplexity: boolean;
    note?: string;
  };
}

interface Contact {
  id: number;
  role: string;
  name: string;
  email: string;
}

interface EmailTemplate {
  id: number;
  company_id: number;
  subject: string;
  body: string;
  status: string;
}

const Dashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [editedEmail, setEditedEmail] = useState({ subject: "", body: "" });

  // Fetch companies
  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => api.getCompanies(),
  });

  // Fetch analytics
  const { data: analytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: api.getAnalytics,
  });

  // Start scraping mutation
  const [scrapingTaskId, setScrapingTaskId] = useState<string | null>(null);
  const [scrapingProgress, setScrapingProgress] = useState<{
    processed: number;
    total: number;
    percentage: number;
    status: string;
  } | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startPolling = (taskId: string) => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const status = await api.getScrapingStatus(taskId);
        setScrapingProgress({
          processed: status.processed_companies,
          total: status.total_companies,
          percentage: status.progress_percentage,
          status: status.status,
        });
        if (status.status === "completed") {
          stopPolling();
          setScrapingTaskId(null);
          toast.success(
            `Scraping done — ${status.successful_companies}/${status.total_companies} succeeded`,
          );
          queryClient.invalidateQueries({ queryKey: ["companies"] });
          queryClient.invalidateQueries({ queryKey: ["analytics"] });
          setTimeout(() => setScrapingProgress(null), 4000);
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2000);
  };

  const scrapingMutation = useMutation({
    mutationFn: api.startScraping,
    onSuccess: (data) => {
      if (!data.task_id) {
        toast("No companies to scrape (already processed or none uploaded)");
        return;
      }
      setScrapingTaskId(data.task_id);
      setScrapingProgress({
        processed: 0,
        total: data.total_companies,
        percentage: 0,
        status: "running",
      });
      toast.success(`Scraping ${data.total_companies} companies…`);
      startPolling(data.task_id);
    },
    onError: () => {
      toast.error("Failed to start scraping");
    },
  });

  // Send emails mutation
  const sendEmailsMutation = useMutation({
    mutationFn: () => api.sendEmails(),
    onSuccess: () => {
      toast.success("Emails sent!");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: () => {
      toast.error("Failed to send emails");
    },
  });

  // Upload Excel mutation
  const uploadMutation = useMutation({
    mutationFn: api.uploadExcel,
    onSuccess: (data) => {
      toast.success(`Uploaded ${data.companies_added} companies`);
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: () => {
      toast.error("Failed to upload file");
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleViewEmail = async (company: Company) => {
    setSelectedCompany(company);
    const template = await api.getEmailTemplate(company.id);
    setEditedEmail({ subject: template.subject, body: template.body });
    setEmailDialogOpen(true);
  };

  const handleApproveEmail = async () => {
    if (!selectedCompany) return;

    await api.updateEmailTemplate(selectedCompany.id, editedEmail);
    await api.approveEmail(selectedCompany.id);
    toast.success("Email approved!");
    setEmailDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["companies"] });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<
      string,
      "default" | "primary" | "secondary" | "success" | "warning" | "error"
    > = {
      created: "default",
      scraping: "primary",
      data_parsed: "secondary",
      drafted: "warning",
      approved: "success",
      sent: "success",
      error: "error",
    };
    return colors[status] || "default";
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={4}
      >
        <Typography variant="h4" component="h1" fontWeight="bold">
          B2B Lead Generation Dashboard
        </Typography>
        <Box display="flex" gap={2} flexWrap="wrap">
          <Button
            variant="outlined"
            component="a"
            href="http://localhost:8000/api/companies/template"
            download="companies_template.xlsx"
            startIcon={<Upload />}
          >
            Download Template
          </Button>
          <Button variant="contained" component="label" startIcon={<Upload />}>
            Upload Excel
            <input
              type="file"
              hidden
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
            />
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PlayArrow />}
            onClick={() => scrapingMutation.mutate(undefined)}
            disabled={scrapingMutation.isPending}
          >
            Start Scraping
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<Email />}
            onClick={() => sendEmailsMutation.mutate()}
            disabled={sendEmailsMutation.isPending}
          >
            Send Approved Emails
          </Button>
        </Box>
      </Box>

      {/* Scraping progress banner */}
      {scrapingProgress && (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            mb: 3,
            borderColor:
              scrapingProgress.status === "completed"
                ? "success.main"
                : "primary.main",
          }}
        >
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={1}
          >
            <Typography variant="body2" fontWeight={600}>
              {scrapingProgress.status === "completed"
                ? `✅ Scraping complete — ${scrapingProgress.processed}/${scrapingProgress.total} companies processed`
                : `⚙️ Scraping in progress — ${scrapingProgress.processed} / ${scrapingProgress.total} companies`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {scrapingProgress.percentage.toFixed(0)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={scrapingProgress.percentage}
            color={
              scrapingProgress.status === "completed" ? "success" : "primary"
            }
          />
        </Paper>
      )}

      {/* Analytics Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Companies
              </Typography>
              <Typography variant="h4">
                {analytics?.total_companies || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Emails Drafted
              </Typography>
              <Typography variant="h4">
                {analytics?.companies_by_status?.drafted || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Emails Sent
              </Typography>
              <Typography variant="h4">
                {analytics?.total_emails_sent || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Success Rate
              </Typography>
              <Typography variant="h4">
                {analytics?.scraping_success_rate?.toFixed(0) || 0}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Companies Table */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Companies
        </Typography>

        {isLoading ? (
          <LinearProgress />
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Company</TableCell>
                  <TableCell>Website</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Research</TableCell>
                  <TableCell>CEO</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {companies?.map((company) => {
                  const ceo = company.contacts?.find((c) => c.role === "CEO");
                  return (
                    <TableRow key={company.id}>
                      <TableCell>{company.name}</TableCell>
                      <TableCell>
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {new URL(company.website).hostname}
                        </a>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={company.status}
                          color={getStatusColor(company.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {company.scrape_metadata ? (
                          <Box>
                            <Chip
                              label={
                                company.scrape_metadata.used_perplexity
                                  ? "Perplexity fallback"
                                  : "Local only"
                              }
                              color={
                                company.scrape_metadata.used_perplexity
                                  ? "warning"
                                  : "primary"
                              }
                              size="small"
                              sx={{ mb: 0.5 }}
                            />
                            <Typography variant="caption" display="block" color="text.secondary">
                              {company.scrape_metadata.local_pages_scraped} page(s)
                            </Typography>
                            {company.scrape_metadata.note && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                {company.scrape_metadata.note}
                              </Typography>
                            )}
                          </Box>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{ceo?.name || "-"}</TableCell>
                      <TableCell>{ceo?.email || "-"}</TableCell>
                      <TableCell>
                        {company.status === "drafted" && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleViewEmail(company)}
                          >
                            Review Email
                          </Button>
                        )}
                        {company.status === "approved" && (
                          <Chip
                            label="Ready to Send"
                            color="success"
                            size="small"
                          />
                        )}
                        {company.status === "sent" && (
                          <Chip label="Sent" color="success" size="small" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Email Review Dialog */}
      <Dialog
        open={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Review Email for {selectedCompany?.name}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Subject"
            value={editedEmail.subject}
            onChange={(e) =>
              setEditedEmail({ ...editedEmail, subject: e.target.value })
            }
            margin="normal"
          />
          <TextField
            fullWidth
            label="Email Body"
            value={editedEmail.body}
            onChange={(e) =>
              setEditedEmail({ ...editedEmail, body: e.target.value })
            }
            margin="normal"
            multiline
            rows={15}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleApproveEmail}
            startIcon={<CheckCircle />}
          >
            Approve & Send Later
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Dashboard;
