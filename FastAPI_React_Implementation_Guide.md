# B2B Lead Generation Tool - FastAPI + React + OpenAI

## Overview
A full-stack web application for automated B2B lead generation and outreach using:
- **Backend**: FastAPI (Python)
- **Frontend**: React (TypeScript)
- **AI**: OpenAI GPT-4
- **Database**: PostgreSQL
- **Storage**: Excel/CSV + Database

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend (UI)                      │
│  - Dashboard with company list                               │
│  - Data scraping status monitoring                           │
│  - Email template review & editing                           │
│  - Approval workflow                                         │
│  - Analytics & metrics                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (Python)                   │
│  - REST API endpoints                                        │
│  - Background task processing (Celery/RQ)                    │
│  - Web scraping (BeautifulSoup/Playwright)                   │
│  - OpenAI integration                                        │
│  - Email sending (SMTP/SendGrid)                             │
│  - Excel import/export                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL Database                             │
│  - Companies table                                           │
│  - Contacts table (CEO/CTO/CFO)                              │
│  - Email templates table                                     │
│  - Email logs table                                          │
│  - Processing queue table                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                         │
│  - OpenAI API (GPT-4)                                        │
│  - Hunter.io API (email finding)                             │
│  - Gmail/SendGrid (email delivery)                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack Comparison

| Feature | N8n | FastAPI + React |
|---------|-----|-----------------|
| **Setup Time** | 30 mins | 2-4 hours |
| **Customization** | Limited | Unlimited |
| **UI Quality** | Basic | Professional |
| **Scalability** | Good | Excellent |
| **Cost** | $0-20/month | $0-50/month |
| **Learning Curve** | Low | Medium-High |
| **Deployment** | Easy | Moderate |
| **Code Control** | Limited | Full control |

**Verdict**: ✅ **YES, it will work** - and it will be more powerful, scalable, and customizable!

---

## Project Structure

```
b2b-lead-generation/
│
├── backend/                    # FastAPI Python backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py            # FastAPI app entry point
│   │   ├── config.py          # Configuration & env vars
│   │   ├── database.py        # Database connection
│   │   │
│   │   ├── models/            # SQLAlchemy models
│   │   │   ├── __init__.py
│   │   │   ├── company.py
│   │   │   ├── contact.py
│   │   │   ├── email_template.py
│   │   │   └── email_log.py
│   │   │
│   │   ├── schemas/           # Pydantic schemas
│   │   │   ├── __init__.py
│   │   │   ├── company.py
│   │   │   ├── contact.py
│   │   │   └── email.py
│   │   │
│   │   ├── api/               # API routes
│   │   │   ├── __init__.py
│   │   │   ├── companies.py
│   │   │   ├── scraping.py
│   │   │   ├── emails.py
│   │   │   └── analytics.py
│   │   │
│   │   ├── services/          # Business logic
│   │   │   ├── __init__.py
│   │   │   ├── scraper.py
│   │   │   ├── openai_service.py
│   │   │   ├── email_service.py
│   │   │   └── excel_service.py
│   │   │
│   │   ├── tasks/             # Background tasks
│   │   │   ├── __init__.py
│   │   │   ├── scraping_tasks.py
│   │   │   └── email_tasks.py
│   │   │
│   │   └── utils/             # Utility functions
│   │       ├── __init__.py
│   │       ├── validators.py
│   │       └── helpers.py
│   │
│   ├── requirements.txt       # Python dependencies
│   ├── .env                   # Environment variables
│   └── alembic/               # Database migrations
│
├── frontend/                   # React TypeScript frontend
│   ├── public/
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── CompanyList.tsx
│   │   │   ├── CompanyForm.tsx
│   │   │   ├── EmailEditor.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   └── Analytics.tsx
│   │   │
│   │   ├── pages/             # Page components
│   │   │   ├── HomePage.tsx
│   │   │   ├── CompaniesPage.tsx
│   │   │   ├── EmailsPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   │
│   │   ├── services/          # API client
│   │   │   ├── api.ts
│   │   │   ├── companies.ts
│   │   │   └── emails.ts
│   │   │
│   │   ├── types/             # TypeScript types
│   │   │   └── index.ts
│   │   │
│   │   ├── hooks/             # Custom hooks
│   │   │   └── useCompanies.ts
│   │   │
│   │   ├── App.tsx
│   │   └── index.tsx
│   │
│   ├── package.json
│   └── tsconfig.json
│
├── docker-compose.yml         # Docker setup
├── .env.example               # Environment template
└── README.md
```

---

## Database Schema

### Companies Table
```sql
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    website VARCHAR(500) NOT NULL,
    status VARCHAR(50) DEFAULT 'created',
    company_info TEXT,
    projects TEXT,
    news TEXT,
    phone VARCHAR(50),
    landline VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_companies_status ON companies(status);
```

### Contacts Table
```sql
CREATE TABLE contacts (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    role VARCHAR(50),  -- 'CEO', 'CTO', 'CFO'
    name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_role ON contacts(role);
```

### Email Templates Table
```sql
CREATE TABLE email_templates (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    subject VARCHAR(500),
    body TEXT,
    status VARCHAR(50) DEFAULT 'drafted',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Email Logs Table
```sql
CREATE TABLE email_logs (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES email_templates(id),
    company_id INTEGER REFERENCES companies(id),
    recipient_email VARCHAR(255),
    sent_at TIMESTAMP,
    status VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints

### Companies

**POST /api/companies/upload**
- Upload Excel file with companies
- Parses and stores in database

**GET /api/companies**
- Get all companies with filters
- Query params: status, limit, offset

**GET /api/companies/{id}**
- Get single company details

**PUT /api/companies/{id}**
- Update company information

**DELETE /api/companies/{id}**
- Delete company

### Scraping

**POST /api/scraping/start**
- Start scraping for companies with status="created"
- Returns task_id for background job

**GET /api/scraping/status/{task_id}**
- Get scraping task status

**POST /api/scraping/company/{id}**
- Scrape specific company

### Emails

**GET /api/emails/templates**
- Get all email templates
- Filter by status (drafted, approved, sent)

**GET /api/emails/templates/{id}**
- Get specific template

**PUT /api/emails/templates/{id}**
- Update email template (for manual editing)

**POST /api/emails/templates/{id}/approve**
- Approve email template

**POST /api/emails/send**
- Send all approved emails

**GET /api/emails/logs**
- Get email sending logs

### Analytics

**GET /api/analytics/dashboard**
- Get dashboard metrics
- Total companies, scraping success rate, emails sent, etc.

**GET /api/analytics/status-distribution**
- Company status distribution

---

## Installation & Setup

### Prerequisites

```bash
# System requirements
- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- Redis (for background tasks)
```

### Backend Setup

**1. Create virtual environment:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

**2. Install dependencies:**
```bash
pip install fastapi uvicorn sqlalchemy psycopg2-binary \
    pydantic pydantic-settings alembic \
    openai beautifulsoup4 playwright requests \
    pandas openpyxl python-multipart \
    celery redis python-dotenv \
    aiosmtplib sendgrid python-jose passlib
```

**3. Create .env file:**
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/b2b_leads

# OpenAI
OPENAI_API_KEY=sk-...your-key-here

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Hunter.io (optional)
HUNTER_API_KEY=your-hunter-key

# Redis
REDIS_URL=redis://localhost:6379/0

# Security
SECRET_KEY=your-secret-key-here
```

**4. Initialize database:**
```bash
alembic init alembic
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

**5. Run server:**
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

**1. Create React app:**
```bash
npx create-react-app frontend --template typescript
cd frontend
```

**2. Install dependencies:**
```bash
npm install axios react-router-dom @tanstack/react-query \
    @mui/material @mui/icons-material @emotion/react @emotion/styled \
    react-hook-form zod @hookform/resolvers \
    recharts react-hot-toast
```

**3. Create .env file:**
```bash
REACT_APP_API_URL=http://localhost:8000
```

**4. Run development server:**
```bash
npm start
```

---

## Code Implementation

### Backend - Main FastAPI App

**app/main.py:**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import companies, scraping, emails, analytics
from app.database import engine, Base

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="B2B Lead Generation API",
    description="Automated lead generation and outreach system",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(companies.router, prefix="/api/companies", tags=["companies"])
app.include_router(scraping.router, prefix="/api/scraping", tags=["scraping"])
app.include_router(emails.router, prefix="/api/emails", tags=["emails"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])

@app.get("/")
def read_root():
    return {"message": "B2B Lead Generation API", "status": "running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
```

### Backend - Company Model

**app/models/company.py:**
```python
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Company(Base):
    __tablename__ = "companies"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    website = Column(String(500), nullable=False)
    status = Column(String(50), default="created")
    company_info = Column(Text, nullable=True)
    projects = Column(Text, nullable=True)
    news = Column(Text, nullable=True)
    phone = Column(String(50), nullable=True)
    landline = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    contacts = relationship("Contact", back_populates="company", cascade="all, delete-orphan")
    email_templates = relationship("EmailTemplate", back_populates="company", cascade="all, delete-orphan")
```

**app/models/contact.py:**
```python
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Contact(Base):
    __tablename__ = "contacts"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"))
    role = Column(String(50))  # CEO, CTO, CFO
    name = Column(String(255))
    email = Column(String(255))
    phone = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    company = relationship("Company", back_populates="contacts")
```

### Backend - OpenAI Service

**app/services/openai_service.py:**
```python
import openai
from typing import Dict, Any
import json
from app.config import settings

openai.api_key = settings.OPENAI_API_KEY

class OpenAIService:
    
    @staticmethod
    async def extract_company_data(company_name: str, website: str, html_content: str = "") -> Dict[str, Any]:
        """Extract company information using GPT-4"""
        
        prompt = f"""
        Analyze this company and extract the following information:
        
        Company: {company_name}
        Website: {website}
        
        Please search the web and extract:
        1. CEO name and email address
        2. CTO name and email address (if available)
        3. CFO name and email address (if available)
        4. Company phone number
        5. Company landline/main contact number
        6. Brief company description (2-3 sentences)
        7. Recent projects, products, or services (bullet points)
        8. Latest news or announcements (last 3 items)
        
        Return ONLY a JSON object with these exact keys:
        {{
            "ceo_name": "",
            "ceo_email": "",
            "cto_name": "",
            "cto_email": "",
            "cfo_name": "",
            "cfo_email": "",
            "phone": "",
            "landline": "",
            "company_info": "",
            "projects": "",
            "news": ""
        }}
        
        If any information is not found, use empty string.
        """
        
        try:
            response = openai.ChatCompletion.create(
                model="gpt-4-turbo-preview",
                messages=[
                    {"role": "system", "content": "You are a data extraction assistant. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=2000
            )
            
            content = response.choices[0].message.content
            
            # Extract JSON from response
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            
            if json_start != -1 and json_end > json_start:
                json_str = content[json_start:json_end]
                data = json.loads(json_str)
                return data
            else:
                raise ValueError("No JSON found in response")
                
        except Exception as e:
            print(f"Error extracting company data: {e}")
            return {
                "ceo_name": "",
                "ceo_email": "",
                "cto_name": "",
                "cto_email": "",
                "cfo_name": "",
                "cfo_email": "",
                "phone": "",
                "landline": "",
                "company_info": "",
                "projects": "",
                "news": ""
            }
    
    @staticmethod
    async def generate_email_template(
        company_name: str,
        ceo_name: str,
        company_info: str,
        projects: str,
        news: str,
        my_company_info: Dict[str, str]
    ) -> Dict[str, str]:
        """Generate personalized email template using GPT-4"""
        
        prompt = f"""
        Create a personalized B2B outreach email based on this information:
        
        TARGET COMPANY:
        Company Name: {company_name}
        CEO: {ceo_name}
        Company Info: {company_info}
        Recent Projects: {projects}
        Recent News: {news}
        
        MY COMPANY:
        Name: {my_company_info.get('name', 'Your Company')}
        Services: {my_company_info.get('services', 'AI and Automation solutions')}
        Value Proposition: {my_company_info.get('value_prop', 'We help companies optimize operations')}
        
        Portfolio Highlights:
        {my_company_info.get('portfolio', '- AI automation projects')}
        
        EMAIL REQUIREMENTS:
        1. Professional and personalized tone
        2. Reference their specific projects or recent news
        3. Explain how our AI/Automation services can benefit their business
        4. Keep it concise (under 200 words)
        5. Include a clear call-to-action
        6. Address it to the CEO by name
        
        Return ONLY a JSON object with:
        {{
            "subject": "compelling subject line",
            "body": "email body with proper formatting"
        }}
        """
        
        try:
            response = openai.ChatCompletion.create(
                model="gpt-4-turbo-preview",
                messages=[
                    {"role": "system", "content": "You are an expert email copywriter. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=1000
            )
            
            content = response.choices[0].message.content
            
            # Extract JSON
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            
            if json_start != -1 and json_end > json_start:
                json_str = content[json_start:json_end]
                data = json.loads(json_str)
                return data
            else:
                raise ValueError("No JSON found in response")
                
        except Exception as e:
            print(f"Error generating email: {e}")
            return {
                "subject": f"Partnership Opportunity with {my_company_info.get('name', 'Our Company')}",
                "body": f"Dear {ceo_name},\n\nI hope this email finds you well..."
            }
```

### Backend - Scraping Service

**app/services/scraper.py:**
```python
import requests
from bs4 import BeautifulSoup
from typing import Dict, Optional
import asyncio
from playwright.async_api import async_playwright

class WebScraperService:
    
    @staticmethod
    async def fetch_website_content(url: str) -> str:
        """Fetch website HTML content"""
        try:
            # Simple requests first
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            return response.text
            
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            # Try with Playwright for JavaScript-heavy sites
            try:
                return await WebScraperService.fetch_with_playwright(url)
            except:
                return ""
    
    @staticmethod
    async def fetch_with_playwright(url: str) -> str:
        """Fetch content from JavaScript-heavy sites"""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()
            await page.goto(url)
            await page.wait_for_load_state('networkidle')
            content = await page.content()
            await browser.close()
            return content
    
    @staticmethod
    def extract_basic_info(html: str, url: str) -> Dict[str, str]:
        """Extract basic information from HTML"""
        soup = BeautifulSoup(html, 'html.parser')
        
        info = {
            'phone': '',
            'email': '',
            'description': ''
        }
        
        # Try to find phone numbers
        phone_patterns = soup.find_all(text=lambda text: text and any(
            pattern in text for pattern in ['+', 'tel:', 'Tel:', 'Phone:']
        ))
        if phone_patterns:
            info['phone'] = phone_patterns[0].strip()
        
        # Try to find emails
        email_links = soup.find_all('a', href=lambda href: href and 'mailto:' in href)
        if email_links:
            info['email'] = email_links[0]['href'].replace('mailto:', '')
        
        # Get meta description
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc and meta_desc.get('content'):
            info['description'] = meta_desc['content']
        
        return info
```

### Backend - Companies API

**app/api/companies.py:**
```python
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from typing import List
import pandas as pd
from io import BytesIO

from app.database import get_db
from app.models.company import Company
from app.schemas.company import CompanyCreate, CompanyResponse, CompanyUpdate

router = APIRouter()

@router.post("/upload")
async def upload_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload Excel file with companies"""
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be Excel format")
    
    try:
        # Read Excel file
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents))
        
        # Validate required columns
        required_cols = ['Company_Name', 'Website']
        if not all(col in df.columns for col in required_cols):
            raise HTTPException(
                status_code=400,
                detail=f"Excel must contain columns: {required_cols}"
            )
        
        # Insert companies
        companies_added = 0
        for _, row in df.iterrows():
            company = Company(
                name=row['Company_Name'],
                website=row['Website'],
                status='created'
            )
            db.add(company)
            companies_added += 1
        
        db.commit()
        
        return {
            "message": f"Successfully uploaded {companies_added} companies",
            "count": companies_added
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/", response_model=List[CompanyResponse])
def get_companies(
    status: str = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all companies with optional filtering"""
    
    query = db.query(Company)
    
    if status:
        query = query.filter(Company.status == status)
    
    companies = query.offset(skip).limit(limit).all()
    return companies

@router.get("/{company_id}", response_model=CompanyResponse)
def get_company(company_id: int, db: Session = Depends(get_db)):
    """Get single company by ID"""
    
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    return company

@router.put("/{company_id}", response_model=CompanyResponse)
def update_company(
    company_id: int,
    company_update: CompanyUpdate,
    db: Session = Depends(get_db)
):
    """Update company information"""
    
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    for key, value in company_update.dict(exclude_unset=True).items():
        setattr(company, key, value)
    
    db.commit()
    db.refresh(company)
    
    return company

@router.delete("/{company_id}")
def delete_company(company_id: int, db: Session = Depends(get_db)):
    """Delete company"""
    
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    db.delete(company)
    db.commit()
    
    return {"message": "Company deleted successfully"}
```

This is getting quite long. Let me create the complete implementation files...
