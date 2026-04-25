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
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { CheckCircle, LinkedIn } from "@mui/icons-material";
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

const Dashboard: React.FC = () => {
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

  // LinkedIn connection status
  const { data: linkedInStatus } = useQuery({
    queryKey: ["linkedInStatus"],
    queryFn: api.getLinkedInStatus,
  });

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
        <Box display="flex" gap={1} alignItems="center">
          {linkedInStatus?.configured ? (
            linkedInStatus?.connected ? (
              <Chip
                icon={<LinkedIn />}
                label={`LinkedIn: ${linkedInStatus.linkedin_name || "Connected"}`}
                color="primary"
                variant="outlined"
                onDelete={async () => {
                  await api.disconnectLinkedIn();
                  queryClient.invalidateQueries({
                    queryKey: ["linkedInStatus"],
                  });
                  toast.success("LinkedIn disconnected");
                }}
              />
            ) : (
              <Button
                variant="outlined"
                startIcon={<LinkedIn />}
                onClick={async () => {
                  const { auth_url } = await api.getLinkedInConnectUrl();
                  window.location.href = auth_url;
                }}
              >
                Connect LinkedIn
              </Button>
            )
          ) : (
            <Tooltip title="Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to .env to enable">
              <span>
                <Button variant="outlined" startIcon={<LinkedIn />} disabled>
                  LinkedIn (not configured)
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
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
