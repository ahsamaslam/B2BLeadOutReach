export const BROADCAST_LEADS_STORAGE_KEY = "broadcast_leads_payload";

export interface BroadcastLeadPayload {
  id: number;
  company_name: string;
  niche: string;
  domain: string;
  location: string;
  platform: string;
  decision_maker: string;
  owner_name: string;
  role: string;
  linkedin: string;
  email_pattern: string;
  ai_gap: string;
  remarks: string;
  email?: string;
}

export interface BroadcastLocationState {
  broadcastLeads: BroadcastLeadPayload[];
}

export function consumeBroadcastLeadsFromStorage():
  | BroadcastLeadPayload[]
  | null {
  try {
    const raw = localStorage.getItem(BROADCAST_LEADS_STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(BROADCAST_LEADS_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
