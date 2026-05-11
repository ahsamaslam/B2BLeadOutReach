import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
const TOKEN_KEY = "auth_token";

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
};

const axiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use((config) => {
  const token = authStorage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401 (expired / invalid token)
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      authStorage.clearToken();
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export const api = {
  // Auth
  register: async (payload: { email: string; password: string }) => {
    const response = await axiosInstance.post("/api/auth/register", payload);
    return response.data;
  },

  login: async (payload: { email: string; password: string }) => {
    const response = await axiosInstance.post("/api/auth/login", payload);
    return response.data;
  },

  logout: async () => {
    const response = await axiosInstance.post("/api/auth/logout");
    return response.data;
  },

  me: async () => {
    const response = await axiosInstance.get("/api/auth/me");
    return response.data as {
      id: number;
      email: string;
      is_active: boolean;
      is_admin: boolean;
      tenant_id: number | null;
      created_at: string;
    };
  },

  // Companies
  createManualLead: async (payload: {
    name: string;
    website?: string;
    niche?: string;
    location?: string;
    address?: string;
    business_type?: string;
    phone?: string;
    ceo_name?: string;
    ceo_email?: string;
    ceo_phone?: string;
    email_subject?: string;
    email_body?: string;
  }) => {
    const response = await axiosInstance.post("/api/companies/manual", payload);
    return response.data;
  },
  getCompanies: async (status?: string) => {
    const params = status ? { status } : {};
    const response = await axiosInstance.get("/api/companies", { params });
    return response.data;
  },

  getCompany: async (id: number) => {
    const response = await axiosInstance.get(`/api/companies/${id}`);
    return response.data;
  },

  uploadExcel: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await axiosInstance.post(
      "/api/companies/upload",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data;
  },

  downloadLeadsTemplateBlob: async () => {
    const response = await axiosInstance.get("/api/companies/template", {
      responseType: "blob",
    });
    return response;
  },

  updateCompany: async (id: number, data: any) => {
    const response = await axiosInstance.put(`/api/companies/${id}`, data);
    return response.data;
  },

  deleteCompany: async (id: number) => {
    const response = await axiosInstance.delete(`/api/companies/${id}`);
    return response.data;
  },

  bulkDeleteCompanies: async (ids: number[]) => {
    const response = await axiosInstance.delete("/api/companies/bulk", {
      data: { ids },
    });
    return response.data;
  },

  startScraping: async (companyIds?: number[]) => {
    const response = await axiosInstance.post("/api/scraping/start", {
      company_ids: companyIds ?? null,
    });
    return response.data;
  },

  getScrapingStatus: async (taskId: string) => {
    const response = await axiosInstance.get(`/api/scraping/status/${taskId}`);
    return response.data;
  },

  // Emails
  getEmailTemplates: async (status?: string) => {
    const params = status ? { status } : {};
    const response = await axiosInstance.get("/api/emails/templates", {
      params,
    });
    return response.data;
  },

  getEmailTemplate: async (companyId: number) => {
    const response = await axiosInstance.get(
      `/api/emails/templates/${companyId}`,
    );
    return response.data;
  },

  updateEmailTemplate: async (
    templateId: number,
    data: { subject: string; body: string },
  ) => {
    const response = await axiosInstance.put(
      `/api/emails/templates/${templateId}`,
      data,
    );
    return response.data;
  },

  approveEmail: async (templateId: number) => {
    const response = await axiosInstance.post(
      `/api/emails/templates/${templateId}/approve`,
    );
    return response.data;
  },

  sendEmails: async (options?: { attach_portfolio?: boolean }) => {
    const response = await axiosInstance.post(
      "/api/emails/send",
      options ?? {},
    );
    return response.data;
  },

  getEmailLogs: async () => {
    const response = await axiosInstance.get("/api/emails/logs");
    return response.data as Array<{
      id: number;
      company_id: number;
      status: string;
      opened_at: string | null;
      sent_at: string | null;
    }>;
  },

  // Analytics
  getAnalytics: async () => {
    const response = await axiosInstance.get("/api/analytics/dashboard");
    return response.data;
  },

  getStatusDistribution: async () => {
    const response = await axiosInstance.get(
      "/api/analytics/status-distribution",
    );
    return response.data;
  },

  // Portfolio
  listPortfolio: async () => {
    const response = await axiosInstance.get("/api/portfolio/");
    return response.data;
  },

  uploadPortfolio: async (formData: FormData) => {
    const response = await axiosInstance.post(
      "/api/portfolio/upload",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return response.data;
  },

  deletePortfolio: async (storedName: string) => {
    const response = await axiosInstance.delete(`/api/portfolio/${storedName}`);
    return response.data;
  },

  testSmtp: async () => {
    const response = await axiosInstance.post("/api/emails/test-smtp");
    return response.data;
  },

  // Leads export
  exportLeads: (
    format: "csv" | "xlsx" = "csv",
    filters?: { niche?: string; location?: string; status?: string },
  ) => {
    const params = new URLSearchParams({ format });
    if (filters?.niche) params.set("niche", filters.niche);
    if (filters?.location) params.set("location", filters.location);
    if (filters?.status) params.set("status", filters.status);
    const token = authStorage.getToken();
    // Return URL so caller can use <a href> for direct download
    return `${API_URL}/api/companies/export?${params.toString()}&_token=${token}`;
  },

  exportLeadsBlob: async (
    format: "csv" | "xlsx" = "csv",
    filters?: { niche?: string; location?: string; status?: string },
  ) => {
    const params: Record<string, string> = { format };
    if (filters?.niche) params.niche = filters.niche;
    if (filters?.location) params.location = filters.location;
    if (filters?.status) params.status = filters.status;
    const response = await axiosInstance.get("/api/companies/export", {
      params,
      responseType: "blob",
    });
    return response;
  },

  // Campaign templates
  getCampaignTemplates: async () => {
    const response = await axiosInstance.get("/api/emails/campaign-templates");
    return response.data;
  },

  createCampaignTemplate: async (payload: {
    name: string;
    subject_template: string;
    body_template: string;
    instructions?: string;
    attach_portfolio?: boolean;
  }) => {
    const response = await axiosInstance.post(
      "/api/emails/campaign-templates",
      payload,
    );
    return response.data;
  },

  updateCampaignTemplate: async (
    id: number,
    payload: Partial<{
      name: string;
      subject_template: string;
      body_template: string;
      instructions: string;
      attach_portfolio: boolean;
    }>,
  ) => {
    const response = await axiosInstance.put(
      `/api/emails/campaign-templates/${id}`,
      payload,
    );
    return response.data;
  },

  deleteCampaignTemplate: async (id: number) => {
    const response = await axiosInstance.delete(
      `/api/emails/campaign-templates/${id}`,
    );
    return response.data;
  },

  // Bulk send
  sendBulkEmails: async (payload: {
    company_ids: number[];
    campaign_template_id: number;
    attach_portfolio?: boolean;
  }) => {
    const response = await axiosInstance.post("/api/emails/send-bulk", payload);
    return response.data;
  },

  // Settings
  getSettings: async () => {
    const response = await axiosInstance.get("/api/settings");
    return response.data as {
      tenant_id: number;
      tenant_name: string;
      plan: string;
      schema: Record<
        string,
        Array<{ key: string; label: string; type: string }>
      >;
      values: Record<string, string>;
    };
  },

  updateSettings: async (values: Record<string, string>) => {
    const response = await axiosInstance.put("/api/settings", { values });
    return response.data;
  },

  // Admin
  adminMe: async () => {
    const response = await axiosInstance.get("/api/admin/me");
    return response.data as {
      is_admin: boolean;
      user_id: number;
      email: string;
      tenant_id: number | null;
    };
  },

  adminListTenants: async () => {
    const response = await axiosInstance.get("/api/admin/tenants");
    return response.data as Array<{
      id: number;
      name: string;
      plan: string;
      is_active: boolean;
      user_count: number;
      created_at: string;
    }>;
  },

  adminUpdatePlan: async (tenantId: number, plan: string) => {
    const response = await axiosInstance.put(
      `/api/admin/tenants/${tenantId}/plan`,
      { plan },
    );
    return response.data;
  },

  // AI email generation (broadcast campaign)
  generateAiEmails: async (payload: {
    prompt: string;
    leads: Array<{
      company_name: string;
      niche: string;
      domain: string;
      location: string;
      platform: string;
      decision_maker: string;
      role: string;
      linkedin_profile: string;
      company_linkedin: string;
      email_pattern: string;
      recipient_email: string;
      ai_gap_insight: string;
      remarks: string;
      template_name: string;
      template_subject: string;
      template_body: string;
      template_instructions: string;
    }>;
  }) => {
    const response = await axiosInstance.post(
      "/api/emails/generate-ai",
      payload,
    );
    return response.data as {
      items: Array<{
        lead_index: number;
        recipient_name: string;
        company_name: string;
        recipient_email: string;
        subject: string;
        body: string;
        error?: string;
      }>;
    };
  },

  sendAiGeneratedEmails: async (payload: {
    emails: Array<{
      lead_index: number;
      company_id?: number;
      recipient_name: string;
      company_name: string;
      recipient_email: string;
      subject: string;
      body: string;
    }>;
    attach_portfolio?: boolean;
  }) => {
    const response = await axiosInstance.post("/api/emails/send-ai", payload);
    return response.data as {
      items: Array<{
        lead_index: number;
        success: boolean;
        error?: string;
      }>;
      sent: number;
      failed: number;
    };
  },

  getSentHistory: async (limit = 500) => {
    const response = await axiosInstance.get("/api/companies/sent-history", {
      params: { limit },
    });
    return response.data as {
      items: Array<{
        id: number;
        name: string;
        website: string;
        niche: string | null;
        location: string | null;
        recipient_name: string | null;
        recipient_email: string | null;
        subject: string | null;
        body: string | null;
        sent_at: string | null;
        opened_at: string | null;
        open_count: number;
        last_open_user_agent: string | null;
      }>;
      total: number;
    };
  },

  getFollowUps: async (companyId: number) => {
    const response = await axiosInstance.get(
      `/api/followups/company/${companyId}`,
    );
    return response.data as Array<{
      id: number;
      round_number: number;
      status: string;
      subject: string | null;
      body: string | null;
      recipient_email: string;
      recipient_name: string | null;
      scheduled_at: string | null;
      sent_at: string | null;
      opened_at: string | null;
      open_count: number;
      error_message: string | null;
    }>;
  },
};
