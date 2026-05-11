from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


# ─── Tenant / Multi-tenancy ───────────────────────────────────────────────────

class Tenant(Base):
    """A tenant represents a customer organisation using the platform."""
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    plan = Column(String(50), default="free", index=True)
    # plan values: free | starter | professional | enterprise
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    users = relationship("User", back_populates="tenant")
    settings = relationship("TenantSettings", back_populates="tenant", cascade="all, delete-orphan")


class TenantSettings(Base):
    """Per-tenant key-value configuration (overrides global env vars)."""
    __tablename__ = "tenant_settings"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(String(255), nullable=False)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="settings")

    __table_args__ = (UniqueConstraint("tenant_id", "key", name="uq_tenant_settings_key"),)

class Company(Base):
    """Company model - stores target companies for outreach"""
    __tablename__ = "companies"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    website = Column(String(500), nullable=False)
    status = Column(String(50), default="created", index=True)
    # Status values: created, scraping, data_parsed, drafted, approved, sent, error

    # LinkedIn outreach
    linkedin_outreach_status = Column(String(50), nullable=True)  # pending, sent, replied
    linkedin_sent_at = Column(DateTime, nullable=True)

    # Discovery / niche context
    niche = Column(String(255), nullable=True, index=True)
    location = Column(String(255), nullable=True)
    address = Column(String(500), nullable=True)
    business_type = Column(String(500), nullable=True)

    # Scraped data
    company_info = Column(Text, nullable=True)
    projects = Column(Text, nullable=True)
    news = Column(Text, nullable=True)
    phone = Column(String(50), nullable=True)
    landline = Column(String(50), nullable=True)
    
    # Metadata
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    contacts = relationship("Contact", back_populates="company", cascade="all, delete-orphan")
    email_templates = relationship("EmailTemplate", back_populates="company", cascade="all, delete-orphan")
    email_logs = relationship("EmailLog", back_populates="company", cascade="all, delete-orphan")
    follow_up_logs = relationship("FollowUpLog", back_populates="company", cascade="all, delete-orphan")
    scrape_metadata = relationship("ScrapeMetadata", back_populates="company", cascade="all, delete-orphan", uselist=False)


class ScrapeMetadata(Base):
    """Persistent scrape diagnostics for UI visibility and debugging."""
    __tablename__ = "scrape_metadata"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), unique=True, index=True)
    source = Column(String(100), default="local_only", index=True)
    local_pages_scraped = Column(Integer, default=0)
    used_perplexity = Column(Boolean, default=False)
    note = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="scrape_metadata")


class Contact(Base):
    """Contact model - stores CEO, CTO, CFO information"""
    __tablename__ = "contacts"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    
    role = Column(String(50), index=True)  # CEO, CTO, CFO, etc.
    name = Column(String(255))
    email = Column(String(255), index=True)
    phone = Column(String(50), nullable=True)
    linkedin_url = Column(String(500), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    company = relationship("Company", back_populates="contacts")


class EmailTemplate(Base):
    """Email template model - stores generated email drafts"""
    __tablename__ = "email_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    status = Column(String(50), default="drafted", index=True)
    # Status values: drafted, approved, sent, rejected
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)
    
    # Relationships
    company = relationship("Company", back_populates="email_templates")
    email_logs = relationship("EmailLog", back_populates="template", cascade="all, delete-orphan")


class EmailLog(Base):
    """Email log model - tracks email sending history"""
    __tablename__ = "email_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("email_templates.id", ondelete="SET NULL"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    
    recipient_email = Column(String(255), nullable=False)
    recipient_name = Column(String(255), nullable=True)
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=True)
    
    status = Column(String(50), default="pending", index=True)
    # Status values: pending, sent, failed, bounced
    
    sent_at = Column(DateTime, nullable=True, index=True)
    error_message = Column(Text, nullable=True)

    # Email open tracking
    tracking_token = Column(String(36), unique=True, index=True, nullable=True)
    opened_at = Column(DateTime, nullable=True)
    open_count = Column(Integer, default=0, server_default="0")
    last_open_user_agent = Column(Text, nullable=True)
    clicked_at = Column(DateTime, nullable=True)
    replied_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    template = relationship("EmailTemplate", back_populates="email_logs")
    company = relationship("Company", back_populates="email_logs")
    follow_up_logs = relationship("FollowUpLog", back_populates="parent_log", cascade="all, delete-orphan")


class FollowUpLog(Base):
    """Tracks scheduled and sent follow-up emails for each original EmailLog."""
    __tablename__ = "follow_up_logs"

    id = Column(Integer, primary_key=True, index=True)
    parent_log_id = Column(Integer, ForeignKey("email_logs.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)

    round_number = Column(Integer, nullable=False, default=1)  # 1, 2, or 3

    recipient_email = Column(String(255), nullable=False)
    recipient_name = Column(String(255), nullable=True)
    subject = Column(String(500), nullable=True)
    body = Column(Text, nullable=True)

    status = Column(String(50), default="pending", index=True)
    # Status values: pending, sent, failed, skipped

    scheduled_at = Column(DateTime, nullable=True, index=True)
    sent_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    # Open tracking (same mechanism as EmailLog)
    tracking_token = Column(String(36), unique=True, index=True, nullable=True)
    opened_at = Column(DateTime, nullable=True)
    open_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    parent_log = relationship("EmailLog", back_populates="follow_up_logs")
    company = relationship("Company", back_populates="follow_up_logs")


class LinkedInToken(Base):
    """Stores per-user LinkedIn OAuth2 access tokens."""
    __tablename__ = "linkedin_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    access_token = Column(Text, nullable=False)
    linkedin_member_id = Column(String(100), nullable=True)   # LinkedIn URN id
    linkedin_name = Column(String(255), nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="linkedin_token")


class CampaignTemplate(Base):
    """Reusable campaign email template — not tied to a single company."""
    __tablename__ = "campaign_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    subject_template = Column(String(500), nullable=False)
    body_template = Column(Text, nullable=False)
    # Supported placeholders: {{company_name}}, {{owner_name}}, {{address}}, {{niche}}, {{location}}
    instructions = Column(Text, nullable=True)
    attach_portfolio = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ScrapingTask(Base):
    """Scraping task model - tracks background scraping jobs"""
    __tablename__ = "scraping_tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(100), unique=True, index=True)
    
    status = Column(String(50), default="pending", index=True)
    # Status values: pending, running, completed, failed
    
    total_companies = Column(Integer, default=0)
    processed_companies = Column(Integer, default=0)
    successful_companies = Column(Integer, default=0)
    failed_companies = Column(Integer, default=0)
    
    progress_percentage = Column(Float, default=0.0)
    error_message = Column(Text, nullable=True)
    
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class User(Base):
    """User model for authentication"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)  # platform-wide admin
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    tenant = relationship("Tenant", back_populates="users")
    linkedin_token = relationship("LinkedInToken", back_populates="user", uselist=False, cascade="all, delete-orphan")
