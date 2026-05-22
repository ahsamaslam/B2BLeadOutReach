from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Database
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/b2b_leads"
    
    # Anthropic
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-opus-4-5"
    ANTHROPIC_TEMPERATURE: float = 0.7
    ANTHROPIC_MAX_TOKENS: int = 2000

    # Hunter.io (optional — email finding)
    HUNTER_API_KEY: Optional[str] = None

    # Google Custom Search (optional — free 100 queries/day, most reliable web source)
    # Setup: https://developers.google.com/custom-search/v1/introduction
    GOOGLE_CSE_API_KEY: Optional[str] = None
    GOOGLE_CSE_CX: Optional[str] = None
    
    # Email Configuration — Hostinger SMTP
    SMTP_HOST: str = "smtp.hostinger.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "Union Logix"
    
    # SendGrid (alternative to SMTP)
    SENDGRID_API_KEY: Optional[str] = None

    # Resend (HTTP-based, works from Docker)
    RESEND_API_KEY: Optional[str] = None
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Security
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    # Super Admin — seeded automatically on startup from these env vars
    SUPER_ADMIN_EMAIL: str = ""
    SUPER_ADMIN_PASSWORD: str = ""
    
    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    
    # Company Information
    MY_COMPANY_NAME: str = "Your Company"
    MY_COMPANY_SERVICES: str = "AI and Automation"
    MY_COMPANY_VALUE_PROP: str = "We help reduce costs with AI automation"
    MY_COMPANY_PORTFOLIO: str = "- AI chatbot\n- workflow automation"
    MY_COMPANY_WEBSITE: str = "https://example.com"
    MY_COMPANY_CONTACT: str = "contact@example.com"
    SENDER_FULL_NAME: str = ""
    TRACKING_BASE_URL: Optional[str] = None

    # Platform system email — used for tenant invitation emails.
    # Set via PLATFORM_FROM_EMAIL / PLATFORM_FROM_NAME in backend/.env
    PLATFORM_FROM_EMAIL: str = ""
    PLATFORM_FROM_NAME: str = "SendMaster"

    # Follow-up automation
    FOLLOWUP_ENABLED: bool = False
    FOLLOWUP_MAX_ROUNDS: int = 2
    FOLLOWUP_1_DAYS_UNOPENED: int = 3
    FOLLOWUP_2_DAYS_UNOPENED: int = 7
    FOLLOWUP_3_DAYS_UNOPENED: int = 14
    FOLLOWUP_1_DAYS_OPENED: int = 2
    FOLLOWUP_2_DAYS_OPENED: int = 5

    # LinkedIn OAuth2 (optional)
    LINKEDIN_CLIENT_ID: Optional[str] = None
    LINKEDIN_CLIENT_SECRET: Optional[str] = None
    LINKEDIN_REDIRECT_URI: str = "http://localhost:8000/api/linkedin/callback"

    # Rate Limiting
    MAX_SCRAPING_BATCH_SIZE: int = 10
    EMAIL_SEND_DELAY_SECONDS: int = 5
    MAX_EMAILS_PER_DAY: int = 50

    # Deliverability mode: use cleaner plain-text first-touch emails
    DELIVERABILITY_MODE_ENABLED: bool = True
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
