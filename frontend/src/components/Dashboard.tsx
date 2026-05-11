import React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { ArrowForward, CheckCircle } from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";

interface Company {
  id: number;
  name: string;
  website: string;
  status: string;
  contacts: Contact[];
}

interface Contact {
  id: number;
  role: string;
  name: string;
  email: string;
  linkedin_url?: string;
}

interface EmailTemplate {
  id: number;
  company_id: number;
  subject: string;
  body: string;
  status: string;
}

type SentLead = {
  id: number;
  name: string;
  website: string;
  niche: string | null;
  location: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  subject: string | null;
  sent_at: string | null;
  opened_at: string | null;
};

interface DashboardProps {
  onShowHistory?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onShowHistory }) => {
  const queryClient = useQueryClient();
  const [emailDialogOpen, setEmailDialogOpen] = React.useState(false);
  const [selectedCompany, setSelectedCompany] = React.useState<Company | null>(
    null,
  );
  const [editedEmail, setEditedEmail] = React.useState({
    subject: "",
    body: "",
  });

  // Fetch analytics only â€” lead data lives in the Leads tab
  const { data: analytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: api.getAnalytics,
  });
  const { data: sentData } = useQuery<{ items: SentLead[]; total: number }>({
    queryKey: ["sent-history"],
    queryFn: () => api.getSentHistory(50),
  });
  const recentlySent = sentData?.items ?? [];
  const handleApproveEmail = async () => {
    if (!selectedCompany) return;
    await api.updateEmailTemplate(selectedCompany.id, editedEmail);
    await api.approveEmail(selectedCompany.id);
    toast.success("Email approved!");
    setEmailDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["companies"] });
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
      </Box>

      {/* Analytics Stats */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Leads
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
                Enriched
              </Typography>
              <Typography variant="h4">
                {(analytics?.companies_by_status?.data_parsed || 0) +
                  (analytics?.companies_by_status?.drafted || 0) +
                  (analytics?.companies_by_status?.approved || 0) +
                  (analytics?.companies_by_status?.sent || 0)}
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
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Awaiting Approval
              </Typography>
              <Typography variant="h4">
                {analytics?.companies_by_status?.approved || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Errors
              </Typography>
              <Typography variant="h4" color="error.main">
                {analytics?.companies_by_status?.error || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Open Rate
              </Typography>
              <Typography variant="h4">
                {analytics?.email_open_rate?.toFixed(0) || 0}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recently Sent */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Box>
          <Typography variant="h6" fontWeight="bold">
            Recently Sent
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Top {Math.min(recentlySent.length, 50)} leads — ordered by sent date
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          endIcon={<ArrowForward />}
          onClick={onShowHistory}
        >
          Show All ({sentData?.total ?? 0})
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ "& th": { fontWeight: "bold" } }}>
              <TableCell>Company</TableCell>
              <TableCell>Recipient</TableCell>
              <TableCell>Email Address</TableCell>
              <TableCell>Subject</TableCell>
              <TableCell>Niche</TableCell>
              <TableCell>Sent At</TableCell>
              <TableCell>Opened</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recentlySent.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography color="text.secondary" py={3}>
                    No emails sent yet
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              recentlySent.map((lead) => (
                <TableRow key={lead.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {lead.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      {lead.website}
                    </Typography>
                  </TableCell>
                  <TableCell>{lead.recipient_name || "—"}</TableCell>
                  <TableCell>{lead.recipient_email || "—"}</TableCell>
                  <TableCell
                    sx={{
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Typography variant="body2" title={lead.subject ?? ""}>
                      {lead.subject || "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>{lead.niche || "—"}</TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>
                      {lead.sent_at
                        ? new Date(lead.sent_at).toLocaleString()
                        : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {lead.opened_at ? (
                      <Chip label="Opened" color="success" size="small" />
                    ) : (
                      <Chip label="Pending" size="small" variant="outlined" />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Email Review Dialog (triggered from Campaign tab) */}
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
            Approve &amp; Send Later
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Dashboard;
