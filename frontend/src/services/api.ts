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
    return response.data;
  },

  // Companies
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

  updateCompany: async (id: number, data: any) => {
    const response = await axiosInstance.put(`/api/companies/${id}`, data);
    return response.data;
  },

  deleteCompany: async (id: number) => {
    const response = await axiosInstance.delete(`/api/companies/${id}`);
    return response.data;
  },

  // Scraping
  startScraping: async (companyIds?: number[]) => {
    const response = await axiosInstance.post("/api/scraping/start", {
      company_ids: companyIds,
    });
    return response.data;
  },

  getScrapingStatus: async (taskId: string) => {
    const response = await axiosInstance.get(`/api/scraping/status/${taskId}`);
    return response.data;
  },

  scrapeCompany: async (companyId: number) => {
    const response = await axiosInstance.post(
      `/api/scraping/company/${companyId}`,
    );
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
    const response = await axiosInstance.post("/api/emails/send", options ?? {});
    return response.data;
  },

  getEmailLogs: async () => {
    const response = await axiosInstance.get("/api/emails/logs");
    return response.data;
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
    const response = await axiosInstance.post("/api/portfolio/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
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
};
