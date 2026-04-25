import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  LinearProgress,
  Paper,
  Slider,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import { CheckCircle, Email, Phone, TravelExplore } from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "../services/api";

// ── Location options ───────────────────────────────────────────────────────
const LOCATION_OPTIONS: string[] = [
  // Canada – Provinces & Territories
  "Alberta, Canada",
  "British Columbia, Canada",
  "Manitoba, Canada",
  "New Brunswick, Canada",
  "Newfoundland and Labrador, Canada",
  "Northwest Territories, Canada",
  "Nova Scotia, Canada",
  "Nunavut, Canada",
  "Ontario, Canada",
  "Prince Edward Island, Canada",
  "Quebec, Canada",
  "Saskatchewan, Canada",
  "Yukon, Canada",
  // Canada – Major Cities
  "Calgary, Alberta, Canada",
  "Edmonton, Alberta, Canada",
  "Vancouver, British Columbia, Canada",
  "Victoria, British Columbia, Canada",
  "Winnipeg, Manitoba, Canada",
  "Fredericton, New Brunswick, Canada",
  "Halifax, Nova Scotia, Canada",
  "Toronto, Ontario, Canada",
  "Ottawa, Ontario, Canada",
  "Mississauga, Ontario, Canada",
  "Brampton, Ontario, Canada",
  "Hamilton, Ontario, Canada",
  "London, Ontario, Canada",
  "Kitchener, Ontario, Canada",
  "Montreal, Quebec, Canada",
  "Quebec City, Quebec, Canada",
  "Laval, Quebec, Canada",
  "Regina, Saskatchewan, Canada",
  "Saskatoon, Saskatchewan, Canada",
  // USA – States
  "Alabama, USA",
  "Alaska, USA",
  "Arizona, USA",
  "Arkansas, USA",
  "California, USA",
  "Colorado, USA",
  "Connecticut, USA",
  "Delaware, USA",
  "Florida, USA",
  "Georgia, USA",
  "Hawaii, USA",
  "Idaho, USA",
  "Illinois, USA",
  "Indiana, USA",
  "Iowa, USA",
  "Kansas, USA",
  "Kentucky, USA",
  "Louisiana, USA",
  "Maine, USA",
  "Maryland, USA",
  "Massachusetts, USA",
  "Michigan, USA",
  "Minnesota, USA",
  "Mississippi, USA",
  "Missouri, USA",
  "Montana, USA",
  "Nebraska, USA",
  "Nevada, USA",
  "New Hampshire, USA",
  "New Jersey, USA",
  "New Mexico, USA",
  "New York, USA",
  "North Carolina, USA",
  "North Dakota, USA",
  "Ohio, USA",
  "Oklahoma, USA",
  "Oregon, USA",
  "Pennsylvania, USA",
  "Rhode Island, USA",
  "South Carolina, USA",
  "South Dakota, USA",
  "Tennessee, USA",
  "Texas, USA",
  "Utah, USA",
  "Vermont, USA",
  "Virginia, USA",
  "Washington, USA",
  "West Virginia, USA",
  "Wisconsin, USA",
  "Wyoming, USA",
  // USA – Major Cities
  "New York City, New York, USA",
  "Los Angeles, California, USA",
  "Chicago, Illinois, USA",
  "Houston, Texas, USA",
  "Phoenix, Arizona, USA",
  "Philadelphia, Pennsylvania, USA",
  "San Antonio, Texas, USA",
  "San Diego, California, USA",
  "Dallas, Texas, USA",
  "San Jose, California, USA",
  "Austin, Texas, USA",
  "Jacksonville, Florida, USA",
  "Fort Worth, Texas, USA",
  "Columbus, Ohio, USA",
  "Charlotte, North Carolina, USA",
  "Indianapolis, Indiana, USA",
  "San Francisco, California, USA",
  "Seattle, Washington, USA",
  "Denver, Colorado, USA",
  "Nashville, Tennessee, USA",
  "Miami, Florida, USA",
  "Atlanta, Georgia, USA",
  "Boston, Massachusetts, USA",
  "Las Vegas, Nevada, USA",
  "Portland, Oregon, USA",
  // UK – Regions & Countries
  "England, UK",
  "Scotland, UK",
  "Wales, UK",
  "Northern Ireland, UK",
  // UK – Major Cities
  "London, England, UK",
  "Birmingham, England, UK",
  "Manchester, England, UK",
  "Leeds, England, UK",
  "Glasgow, Scotland, UK",
  "Sheffield, England, UK",
  "Bradford, England, UK",
  "Liverpool, England, UK",
  "Edinburgh, Scotland, UK",
  "Bristol, England, UK",
  "Cardiff, Wales, UK",
  "Leicester, England, UK",
  "Nottingham, England, UK",
  "Coventry, England, UK",
  "Belfast, Northern Ireland, UK",
  // Australia – States & Territories
  "New South Wales, Australia",
  "Victoria, Australia",
  "Queensland, Australia",
  "Western Australia, Australia",
  "South Australia, Australia",
  "Tasmania, Australia",
  "Australian Capital Territory, Australia",
  "Northern Territory, Australia",
  // Australia – Major Cities
  "Sydney, New South Wales, Australia",
  "Melbourne, Victoria, Australia",
  "Brisbane, Queensland, Australia",
  "Perth, Western Australia, Australia",
  "Adelaide, South Australia, Australia",
  "Canberra, ACT, Australia",
  "Hobart, Tasmania, Australia",
  "Darwin, Northern Territory, Australia",
  // Countries
  "United States",
  "Canada",
  "United Kingdom",
  "Australia",
  "New Zealand",
  "Ireland",
  "Germany",
  "France",
  "Netherlands",
  "Belgium",
  "Switzerland",
  "Austria",
  "Sweden",
  "Norway",
  "Denmark",
  "Finland",
  "Spain",
  "Portugal",
  "Italy",
  "Poland",
  "Czech Republic",
  "Hungary",
  "Romania",
  "Greece",
  "Turkey",
  "South Africa",
  "Nigeria",
  "Kenya",
  "Ghana",
  "Egypt",
  "Israel",
  "UAE",
  "Saudi Arabia",
  "India",
  "Pakistan",
  "Bangladesh",
  "Singapore",
  "Malaysia",
  "Philippines",
  "Indonesia",
  "Thailand",
  "Vietnam",
  "Japan",
  "South Korea",
  "China",
  "Hong Kong",
  "Taiwan",
  "Brazil",
  "Mexico",
  "Argentina",
  "Colombia",
  "Chile",
  "Peru",
];

interface DiscoveredCompany {
  name: string;
  website: string;
  address: string | null;
  reason: string | null;
}

interface DiscoveryResult {
  discovered: DiscoveredCompany[];
  companies_seeded: number;
  companies_skipped: number;
  task_id: string | null;
}

interface ScrapeProgress {
  processed: number;
  total: number;
  percentage: number;
  status: string;
}

// Discovery search steps shown during the ~3 minute wait
const DISCOVERY_STEPS = [
  "Searching the web",
  "Mining AI knowledge",
  "Qualifying leads",
];

const NicheSearch: React.FC = () => {
  const queryClient = useQueryClient();
  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [maxResults, setMaxResults] = useState(10);
  const [autoScrape, setAutoScrape] = useState(true);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState<ScrapeProgress | null>(
    null,
  );
  const [discoveryStep, setDiscoveryStep] = useState(0);
  const [seededIds, setSeededIds] = useState<number[]>([]);
  const [scraping, setScraping] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll scraped company details (contacts/emails) for just-discovered companies
  const { data: liveCompanies } = useQuery({
    queryKey: ["companies"],
    queryFn: () => api.getCompanies(),
    refetchInterval: scraping ? 4000 : false,
    enabled: scraping && seededIds.length > 0,
  });

  // Map id → enriched company for the seeded batch
  const enrichedMap = React.useMemo(() => {
    const m: Record<number, any> = {};
    if (liveCompanies) {
      (liveCompanies as any[]).forEach((c: any) => {
        m[c.id] = c;
      });
    }
    return m;
  }, [liveCompanies]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };
  const stopSteps = () => {
    if (stepRef.current) {
      clearInterval(stepRef.current);
      stepRef.current = null;
    }
  };

  // Advance step indicator every ~55 seconds (3 steps over ~2.5 min)
  const startStepIndicator = () => {
    stopSteps();
    setDiscoveryStep(0);
    stepRef.current = setInterval(() => {
      setDiscoveryStep((s) => Math.min(s + 1, DISCOVERY_STEPS.length - 1));
    }, 55000);
  };

  const startPolling = (taskId: string) => {
    stopPolling();
    setScraping(true);
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.discoveryStatus(taskId);
        setScrapeProgress({
          processed: status.processed_companies,
          total: status.total_companies,
          percentage: status.progress_percentage,
          status: status.status,
        });
        if (status.status === "completed") {
          stopPolling();
          setScraping(false);
          toast.success(
            `Enrichment done — ${status.successful_companies}/${status.total_companies} companies enriched`,
          );
          queryClient.invalidateQueries({ queryKey: ["companies"] });
          setTimeout(() => setScrapeProgress(null), 6000);
        }
      } catch {
        // ignore transient errors
      }
    }, 3000);
  };

  const discoveryMutation = useMutation({
    mutationFn: () =>
      api.discoverySearch({
        niche,
        location,
        business_type: businessType,
        max_results: maxResults,
        auto_scrape: autoScrape,
      }),
    onSuccess: (data: DiscoveryResult) => {
      stopSteps();
      setDiscoveryStep(DISCOVERY_STEPS.length - 1);
      setResult(data);
      if (data.companies_seeded > 0) {
        toast.success(
          `Found ${data.discovered.length} businesses — ${data.companies_seeded} added`,
        );
      } else if (data.discovered.length > 0) {
        toast(
          `${data.discovered.length} businesses found, all already in your leads list`,
        );
      } else {
        toast("No businesses found — try different keywords");
      }
      if (data.task_id) {
        setScrapeProgress({
          processed: 0,
          total: data.companies_seeded,
          percentage: 0,
          status: "running",
        });
        startPolling(data.task_id);
      }
      // We don't have IDs from discovery response directly, refresh companies list
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (error: any) => {
      stopSteps();
      const detail = error?.response?.data?.detail || "Discovery failed";
      toast.error(detail);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche.trim() || !location.trim()) {
      toast.error("Niche and location are required");
      return;
    }
    setResult(null);
    setScrapeProgress(null);
    setSeededIds([]);
    setScraping(false);
    startStepIndicator();
    discoveryMutation.mutate();
  };

  // Cleanup on unmount
  useEffect(
    () => () => {
      stopPolling();
      stopSteps();
    },
    [],
  );

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 4 }}>
      <Box mb={3}>
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          Discover Leads by Niche
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Describe the type of business you're targeting and we'll find real
          companies using AI research.
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                label="Business Niche"
                placeholder="e.g. dental clinics, law firms, estate agents"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                helperText="The industry or type of business to target"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                freeSolo
                options={LOCATION_OPTIONS}
                value={location}
                onInputChange={(_, value) => setLocation(value)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    required
                    label="Target Location"
                    placeholder="e.g. Ontario, Canada  /  Texas, USA  /  London, UK"
                    helperText="City, province/state, or country"
                  />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Business Characteristics (optional)"
                placeholder="e.g. has a legacy patient management system, uses outdated booking software, likely needs AI automation"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                helperText="Describe what makes a company a good prospect — the more specific the better"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography gutterBottom>
                Max results: <strong>{maxResults}</strong>
              </Typography>
              <Slider
                min={5}
                max={50}
                step={5}
                value={maxResults}
                onChange={(_, v) => setMaxResults(v as number)}
                marks
                valueLabelDisplay="auto"
              />
            </Grid>
            <Grid
              item
              xs={12}
              sm={6}
              sx={{ display: "flex", alignItems: "center", gap: 1 }}
            >
              <Chip
                label={autoScrape ? "Auto-scrape ON" : "Auto-scrape OFF"}
                color={autoScrape ? "success" : "default"}
                onClick={() => setAutoScrape((v) => !v)}
                variant="outlined"
                clickable
              />
              <Typography variant="caption" color="text.secondary">
                {autoScrape
                  ? "Discovered companies will be automatically enriched (contacts, email, phone)"
                  : "Companies will be added but scraping must be triggered manually"}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                startIcon={<TravelExplore />}
                disabled={discoveryMutation.isPending}
              >
                {discoveryMutation.isPending ? "Searching…" : "Find Businesses"}
              </Button>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      {/* Discovery step indicator — shown while search is running */}
      {discoveryMutation.isPending && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <CircularProgress size={20} />
            <Typography variant="body2" fontWeight={600}>
              Discovering businesses — this takes 1–3 minutes…
            </Typography>
          </Box>
          <Stepper activeStep={discoveryStep} alternativeLabel>
            {DISCOVERY_STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Paper>
      )}

      {/* Scraping / enrichment progress bar */}
      {scrapeProgress && (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            mb: 3,
            borderColor:
              scrapeProgress.status === "completed"
                ? "success.main"
                : "primary.main",
          }}
        >
          <Box display="flex" justifyContent="space-between" mb={1}>
            <Typography variant="body2" fontWeight={600}>
              {scrapeProgress.status === "completed"
                ? `Enrichment complete — ${scrapeProgress.processed}/${scrapeProgress.total} companies`
                : `Enriching companies (extracting emails, contacts, info)  ${scrapeProgress.processed}/${scrapeProgress.total}`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {scrapeProgress.percentage.toFixed(0)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={scrapeProgress.percentage}
            color={
              scrapeProgress.status === "completed" ? "success" : "primary"
            }
          />
        </Paper>
      )}

      {/* Results */}
      {result && (
        <Box>
          <Box display="flex" gap={2} mb={2} alignItems="center">
            <Typography variant="h6">
              {result.discovered.length} businesses found
            </Typography>
            {result.companies_seeded > 0 && (
              <Chip
                label={`${result.companies_seeded} added`}
                color="success"
                size="small"
              />
            )}
            {result.companies_skipped > 0 && (
              <Chip
                label={`${result.companies_skipped} already in list`}
                size="small"
                variant="outlined"
              />
            )}
          </Box>

          {result.discovered.length === 0 && (
            <Alert severity="info">
              No businesses were found. Try broadening the niche or location, or
              make the business characteristics less restrictive.
            </Alert>
          )}

          <Grid container spacing={2}>
            {result.discovered.map((company, i) => {
              // Find the live enriched version of this company (matched by name+website)
              const live = Object.values(enrichedMap).find(
                (c: any) =>
                  c.name === company.name && c.website === company.website,
              ) as any | undefined;
              const emails =
                live?.contacts?.map((c: any) => c.email).filter(Boolean) || [];
              const phone = live?.phone || "";
              const isEnriched = live && live.status !== "created";
              const isEnriching = scraping && !isEnriched;

              return (
                <Grid item xs={12} sm={6} md={4} key={i}>
                  <Card
                    variant="outlined"
                    sx={{
                      height: "100%",
                      borderColor: isEnriched ? "success.light" : "divider",
                      position: "relative",
                    }}
                  >
                    {isEnriching && (
                      <LinearProgress
                        sx={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          height: 2,
                        }}
                      />
                    )}
                    <CardContent>
                      <Box
                        display="flex"
                        alignItems="flex-start"
                        justifyContent="space-between"
                      >
                        <Typography
                          variant="subtitle1"
                          fontWeight={600}
                          gutterBottom
                          noWrap
                          sx={{ flex: 1 }}
                        >
                          {company.name}
                        </Typography>
                        {isEnriched && (
                          <CheckCircle
                            sx={{
                              fontSize: 16,
                              color: "success.main",
                              ml: 1,
                              mt: 0.3,
                            }}
                          />
                        )}
                      </Box>
                      <Typography
                        variant="caption"
                        component="div"
                        color="primary"
                        gutterBottom
                      >
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {company.website.replace(/^https?:\/\//, "")}
                        </a>
                      </Typography>
                      {company.address && (
                        <Typography
                          variant="caption"
                          display="block"
                          color="text.secondary"
                          gutterBottom
                        >
                          {company.address}
                        </Typography>
                      )}

                      {/* Live enrichment data */}
                      {emails.length > 0 && (
                        <Box
                          display="flex"
                          alignItems="center"
                          gap={0.5}
                          mt={0.5}
                        >
                          <Email
                            sx={{ fontSize: 13, color: "text.secondary" }}
                          />
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                          >
                            {emails[0]}
                            {emails.length > 1 ? ` +${emails.length - 1}` : ""}
                          </Typography>
                        </Box>
                      )}
                      {phone && (
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Phone
                            sx={{ fontSize: 13, color: "text.secondary" }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {phone}
                          </Typography>
                        </Box>
                      )}
                      {isEnriching && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", mt: 0.5 }}
                        >
                          Enriching…
                        </Typography>
                      )}

                      {company.reason && (
                        <>
                          <Divider sx={{ my: 1 }} />
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontStyle: "italic" }}
                          >
                            {company.reason}
                          </Typography>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}
    </Container>
  );
};

export default NicheSearch;
