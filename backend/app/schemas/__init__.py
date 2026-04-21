from pydantic import BaseModel, EmailStr, HttpUrl, Field
from typing import Optional, List
from datetime import datetime

# ============= Company Schemas =============

class CompanyBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    website: HttpUrl

class CompanyCreate(CompanyBase):
    pass

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    website: Optional[HttpUrl] = None
    status: Optional[str] = None
    company_info: Optional[str] = None
    projects: Optional[str] = None
    news: Optional[str] = None
    phone: Optional[str] = None
    landline: Optional[str] = None

class ContactResponse(BaseModel):
    id: int
    role: str
    name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    
    class Config:
        from_attributes = True


class ScrapeMetadataResponse(BaseModel):
    source: str
    local_pages_scraped: int
    used_perplexity: bool
    note: Optional[str] = None

    class Config:
        from_attributes = True

class CompanyResponse(CompanyBase):
    id: int
    status: str
    company_info: Optional[str]
    projects: Optional[str]
    news: Optional[str]
    phone: Optional[str]
    landline: Optional[str]
    created_at: datetime
    updated_at: datetime
    contacts: List[ContactResponse] = []
    scrape_metadata: Optional[ScrapeMetadataResponse] = None
    
    class Config:
        from_attributes = True

# ============= Contact Schemas =============

class ContactBase(BaseModel):
    role: str
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

class ContactCreate(ContactBase):
    company_id: int

class ContactUpdate(BaseModel):
    role: Optional[str] = None
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

# ============= Email Template Schemas =============

class EmailTemplateBase(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)

class EmailTemplateCreate(EmailTemplateBase):
    company_id: int

class EmailTemplateUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    status: Optional[str] = None

class EmailTemplateResponse(EmailTemplateBase):
    id: int
    company_id: int
    status: str
    created_at: datetime
    updated_at: datetime
    approved_at: Optional[datetime]
    
    class Config:
        from_attributes = True

# ============= Email Log Schemas =============

class EmailLogResponse(BaseModel):
    id: int
    recipient_email: str
    recipient_name: Optional[str]
    subject: str
    status: str
    sent_at: Optional[datetime]
    error_message: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

# ============= Scraping Schemas =============

class ScrapingTaskCreate(BaseModel):
    company_ids: Optional[List[int]] = None  # If None, scrape all with status="created"

class ScrapingTaskResponse(BaseModel):
    task_id: str
    status: str
    total_companies: int
    processed_companies: int
    successful_companies: int
    failed_companies: int
    progress_percentage: float
    started_at: Optional[datetime]
    
    class Config:
        from_attributes = True

# ============= Analytics Schemas =============

class DashboardMetrics(BaseModel):
    total_companies: int
    companies_by_status: dict
    total_emails_sent: int
    emails_sent_today: int
    scraping_success_rate: float
    email_delivery_rate: float
    
class StatusDistribution(BaseModel):
    status: str
    count: int
    percentage: float

# ============= Bulk Upload Schemas =============

class BulkUploadResponse(BaseModel):
    message: str
    companies_added: int
    companies_skipped: int
    errors: List[str] = []


# ============= Auth Schemas =============

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
