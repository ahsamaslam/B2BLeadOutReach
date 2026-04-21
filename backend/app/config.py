from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Database
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/b2b_leads"
    
    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4-turbo-preview"
    OPENAI_TEMPERATURE: float = 0.7
    OPENAI_MAX_TOKENS: int = 2000

    # Perplexity (optional fallback web research)
    PERPLEXITY_API_KEY: str = ""
    PERPLEXITY_MODEL: str = "sonar"
    
    # Hunter.io (optional)
    HUNTER_API_KEY: Optional[str] = None
    
    # Email Configuration — Hostinger SMTP
    SMTP_HOST: str = "smtp.hostinger.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "Union Logix"
    
    # SendGrid (alternative to SMTP)
    SENDGRID_API_KEY: Optional[str] = None
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Security
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    
    # Company Information
    MY_COMPANY_NAME: str = "Your Company"
    MY_COMPANY_SERVICES: str = "AI and Automation"
    MY_COMPANY_VALUE_PROP: str = "We help reduce costs with AI automation"
    MY_COMPANY_PORTFOLIO: str = "- AI chatbot\n- workflow automation"
    MY_COMPANY_WEBSITE: str = "https://example.com"
    MY_COMPANY_CONTACT: str = "contact@example.com"
    
    # Rate Limiting
    MAX_SCRAPING_BATCH_SIZE: int = 10
    EMAIL_SEND_DELAY_SECONDS: int = 5
    MAX_EMAILS_PER_DAY: int = 50
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
