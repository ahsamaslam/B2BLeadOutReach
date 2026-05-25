import axios from "axios";

export interface CampaignSummary {
  id: number;
  name: string;
  template_id: number | null;
  template_name: string | null;
  lead_count: number;
  use_ai: boolean;
  created_at: string;
}

export interface CampaignLeadDetail {
  company_id: number;
  company_name: string;
  niche: string | null;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_role: string | null;
}

export interface CampaignDetail {
  id: number;
  name: string;
  template_id: number | null;
  template_name: string | null;
  use_ai: boolean;
  created_at: string;
  leads: CampaignLeadDetail[];
}

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

// Normalize API responses that should be arrays — handles both plain arrays and {items:[]} wrappers
function toArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && Array.isArray((data as any).items)) return (data as any).items as T[];
  return [];
}

// Auto-logout on 401; show error on 403 (suspended account/workspace)
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      authStorage.clearToken();
      window.location.reload();
    }
    if (error?.response?.status === 403) {
      const detail = error?.response?.data?.detail ?? "Access denied";
      // Dynamically import toast to avoid circular deps
      import("react-hot-toast").then(({ default: toast }) => toast.error(detail));
    }
    return Promise.reject(error);
  },
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
      must_change_password: boolean;
      created_at: string;
    };
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await axiosInstance.post("/api/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data as { message: string };
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
  getCompanies: async (filters?: {
    status?: string;
    search?: string;
    niche?: string;
    location?: string;
    business_type?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params: Record<string, any> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.search) params.search = filters.search;
    if (filters?.niche) params.niche = filters.niche;
    if (filters?.location) params.location = filters.location;
    if (filters?.business_type) params.business_type = filters.business_type;
    if (filters?.limit) params.limit = filters.limit;
    if (filters?.offset) params.offset = filters.offset;
    const response = await axiosInstance.get("/api/companies", { params });
    return toArray(response.data) as any[];
  },

  getCompanyStats: async () => {
    const response = await axiosInstance.get("/api/companies/stats");
    return response.data as {
      total: number;
      enriched: number;
      pending: number;
      errors: number;
    };
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

  getDashboardV2: async (period = "30d") => {
    const response = await axiosInstance.get("/api/analytics/dashboard-v2", {
      params: { period },
    });
    return response.data as {
      stats: {
        leads_in_pipeline: {
          value: number;
          delta_label: string;
          delta_tone: string;
          sub: string;
        };
        emails_sent: {
          value: number;
          delta_label: string;
          delta_tone: string;
          sub: string;
        };
        open_rate: {
          value: number;
          delta_label: string;
          delta_tone: string;
          sub: string;
        };
        replies: {
          value: number;
          delta_label: string;
          delta_tone: string;
          sub: string;
        };
      };
      funnel: Array<{
        stage: string;
        count: number;
        pct: number;
        color: string;
      }>;
      activity: Array<{
        type: string;
        title: string;
        detail: string;
        ago: string;
      }>;
      recent_sent: Array<{
        id: number;
        initials: string;
        company_name: string;
        company_website: string;
        recipient_name: string;
        recipient_email: string;
        subject: string;
        niche: string;
        sent_ago: string;
        status: "opened" | "sent";
      }>;
      total_sent: number;
    };
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
  getCampaignTemplates: async (): Promise<any[]> => {
    const response = await axiosInstance.get("/api/emails/campaign-templates");
    return toArray(response.data);
  },

  createCampaignTemplate: async (payload: {
    name: string;
    subject_template: string;
    body_template: string;
    instructions?: string;
    attach_portfolio?: boolean;
    tags?: string;
    is_default?: boolean;
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
      tags: string;
      is_default: boolean;
    }>,
  ) => {
    const response = await axiosInstance.put(
      `/api/emails/campaign-templates/${id}`,
      payload,
    );
    return response.data;
  },

  duplicateCampaignTemplate: async (id: number) => {
    const response = await axiosInstance.post(
      `/api/emails/campaign-templates/${id}/duplicate`,
    );
    return response.data;
  },

  previewCampaignTemplate: async (id: number) => {
    const response = await axiosInstance.post(
      `/api/emails/campaign-templates/${id}/preview`,
    );
    return response.data as {
      subject: string;
      body: string;
      sample: Record<string, string>;
    };
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

  testSmtp: async () => {
    const response = await axiosInstance.post("/api/settings/test-smtp");
    return response.data as {
      success: boolean;
      message: string;
      latency_ms: number;
      tested_at: string;
      tested_email: string;
    };
  },

  getSmtpStatus: async () => {
    const response = await axiosInstance.get("/api/settings/smtp-status");
    return response.data as {
      success: boolean | null;
      message: string | null;
      latency_ms: number | null;
      tested_at: string | null;
      tested_email: string | null;
    };
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

  adminGetStats: async () => {
    const response = await axiosInstance.get("/api/admin/stats");
    return response.data as {
      total_tenants: number;
      active_tenants: number;
      suspended_tenants: number;
      mrr: number;
      emails_24h: number;
      open_trials: number;
    };
  },

  getUsage: async () => {
    const response = await axiosInstance.get("/api/analytics/usage");
    return response.data as {
      sent: number;
      cap: number | null;
      plan: string;
      plan_label: string;
      tenant_name: string;
    };
  },

  adminListTenants: async (params?: {
    q?: string;
    plan?: string;
    status?: string;
    created_range?: string;
    page?: number;
    page_size?: number;
  }) => {
    const response = await axiosInstance.get("/api/admin/tenants", { params });
    return response.data as {
      items: Array<{
        id: number;
        name: string;
        plan: string;
        is_active: boolean;
        owner_email: string;
        user_count: number;
        emails_this_month: number;
        leads_count: number;
        created_at: string;
      }>;
      total: number;
      page: number;
      page_size: number;
      pages: number;
    };
  },

  adminCreateTenant: async (payload: {
    name: string;
    owner_email: string;
    plan: string;
  }) => {
    const response = await axiosInstance.post("/api/admin/tenants", payload);
    return response.data as {
      id: number;
      name: string;
      plan: string;
      owner_email: string;
      created_at: string;
      temp_password: string | null;
    };
  },

  adminUpdatePlan: async (tenantId: number, plan: string) => {
    const response = await axiosInstance.put(
      `/api/admin/tenants/${tenantId}/plan`,
      { plan },
    );
    return response.data;
  },

  adminSuspendTenant: async (tenantId: number) => {
    const response = await axiosInstance.put(
      `/api/admin/tenants/${tenantId}/suspend`,
    );
    return response.data;
  },

  adminReactivateTenant: async (tenantId: number) => {
    const response = await axiosInstance.put(
      `/api/admin/tenants/${tenantId}/reactivate`,
    );
    return response.data;
  },

  adminDeleteTenant: async (tenantId: number) => {
    const response = await axiosInstance.delete(
      `/api/admin/tenants/${tenantId}`,
    );
    return response.data;
  },

  adminGetTenantUsers: async (tenantId: number) => {
    const response = await axiosInstance.get(
      `/api/admin/tenants/${tenantId}/users`,
    );
    return response.data as Array<{
      id: number;
      email: string;
      display_name: string;
      role: string;
      is_admin: boolean;
      created_at: string;
    }>;
  },

  adminAddTenantUser: async (
    tenantId: number,
    payload: { email: string; role: string; display_name?: string },
  ) => {
    const response = await axiosInstance.post(
      `/api/admin/tenants/${tenantId}/users`,
      payload,
    );
    return response.data as {
      id: number;
      email: string;
      role: string;
      temp_password: string | null;
    };
  },

  adminRemoveTenantUser: async (tenantId: number, userId: number) => {
    const response = await axiosInstance.delete(
      `/api/admin/tenants/${tenantId}/users/${userId}`,
    );
    return response.data;
  },

  adminResendInvite: async (tenantId: number) => {
    const response = await axiosInstance.post(
      `/api/admin/tenants/${tenantId}/resend-invite`,
    );
    return response.data as { status: string; owner_email: string };
  },

  // Team management (settings)
  getTeamMembers: async () => {
    const response = await axiosInstance.get("/api/settings/team");
    return response.data as Array<{
      id: number;
      email: string;
      display_name: string;
      role: string;
      is_admin: boolean;
      created_at: string;
    }>;
  },

  inviteTeamMember: async (payload: {
    email: string;
    role: string;
    display_name?: string;
  }) => {
    const response = await axiosInstance.post(
      "/api/settings/team/invite",
      payload,
    );
    return response.data as {
      id: number;
      email: string;
      role: string;
      temp_password: string | null;
    };
  },

  removeTeamMember: async (userId: number) => {
    const response = await axiosInstance.delete(`/api/settings/team/${userId}`);
    return response.data;
  },

  resendTeamMemberInvite: async (userId: number) => {
    const response = await axiosInstance.post(
      `/api/settings/team/${userId}/resend-invite`,
    );
    return response.data;
  },

  updateTeamMemberRole: async (userId: number, role: string) => {
    const response = await axiosInstance.put(
      `/api/settings/team/${userId}/role`,
      { role },
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

  // ── Broadcast ──────────────────────────────────────────────────────────────

  broadcastGenerate: async (payload: {
    company_ids: number[];
    campaign_template_id: number;
    attach_portfolio?: boolean;
    use_ai?: boolean;
  }, signal?: AbortSignal) => {
    const response = await axiosInstance.post(
      "/api/emails/broadcast/generate",
      payload,
      { signal },
    );
    return response.data as {
      generated: number;
      results: Array<{
        company_id: number;
        template_id: number;
        company_name: string;
        domain: string;
        niche: string;
        location: string;
        contact_name: string;
        contact_email: string;
        status: string;
        subject: string;
        body: string;
        filled_vars: Record<string, string>;
      }>;
    };
  },

  broadcastGetDrafts: async (companyIds: number[]) => {
    const response = await axiosInstance.get("/api/emails/broadcast/drafts", {
      params: { company_ids: companyIds.join(",") },
    });
    return response.data as Array<{
      company_id: number;
      company_name: string;
      domain: string;
      niche: string;
      location: string;
      contact_name: string;
      contact_email: string;
      template_id: number | null;
      status: string;
      subject: string;
      body: string;
      filled_vars: Record<string, string>;
    }>;
  },

  rejectEmailTemplate: async (templateId: number) => {
    const response = await axiosInstance.post(
      `/api/emails/templates/${templateId}/reject`,
    );
    return response.data as { id: number; status: string };
  },

  broadcastSendApproved: async (payload: {
    template_ids: number[];
    attach_portfolio?: boolean;
  }) => {
    const response = await axiosInstance.post(
      "/api/emails/broadcast/send-approved",
      payload,
    );
    return response.data as { sent: number; failed: number; errors: string[] };
  },

  // ── Sent History ──────────────────────────────────────────────────────────

  getHistoryStats: async () => {
    const response = await axiosInstance.get("/api/emails/history/stats");
    return response.data as {
      total_sent: number;
      this_week: number;
      last_week: number;
      delta_week: number;
      opened: number;
      open_rate: number;
      replied: number;
      reply_rate: number;
      bounced: number;
      window_label: string;
    };
  },

  getHistoryChart: async (days = 14) => {
    const response = await axiosInstance.get("/api/emails/history/chart", {
      params: { days },
    });
    return toArray<{ date: string; sent: number; opened: number }>(response.data);
  },

  getHistory: async (params: {
    q?: string;
    status?: string;
    date_range?: string;
    niche?: string;
    page?: number;
    page_size?: number;
  }) => {
    const response = await axiosInstance.get("/api/emails/history", { params });
    return response.data as {
      items: Array<{
        id: number;
        company_id: number;
        company_name: string;
        company_domain: string;
        niche: string | null;
        location: string | null;
        recipient_name: string | null;
        recipient_email: string;
        subject: string;
        status: string;
        sent_at: string | null;
        opened_at: string | null;
        open_count: number;
        replied_at: string | null;
        error_message: string | null;
      }>;
      total: number;
      page: number;
      page_size: number;
      pages: number;
    };
  },

  deleteEmailLog: async (logId: number) => {
    await axiosInstance.delete(`/api/emails/logs/${logId}`);
  },

  getHistoryNiches: async () => {
    const response = await axiosInstance.get("/api/emails/history/niches");
    return toArray<string>(response.data);
  },

  // ── Campaigns ────────────────────────────────────────────────────────────────

  createCampaign: async (data: {
    name: string;
    template_id?: number | null;
    company_ids: number[];
    use_ai: boolean;
  }) => {
    const response = await axiosInstance.post("/api/campaigns", data);
    return response.data as CampaignSummary;
  },

  listCampaigns: async () => {
    const response = await axiosInstance.get("/api/campaigns");
    return toArray<CampaignSummary>(response.data);
  },

  getCampaign: async (id: number) => {
    const response = await axiosInstance.get(`/api/campaigns/${id}`);
    return response.data as CampaignDetail;
  },

  deleteCampaign: async (id: number) => {
    await axiosInstance.delete(`/api/campaigns/${id}`);
  },
};
