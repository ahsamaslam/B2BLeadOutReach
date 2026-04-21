# B2B Lead Generation - FastAPI + React + OpenAI
## Complete Setup Guide

---

## 🎯 What This Tool Does

1. **Upload Companies**: Import Excel file with company names & websites
2. **Auto-Scrape Data**: AI extracts CEO/CTO/CFO emails, phone, company info, projects, news
3. **Generate Emails**: OpenAI creates personalized email templates
4. **Manual Review**: You review and edit emails in beautiful UI
5. **Send Emails**: Automated sending of approved emails
6. **Track Everything**: Analytics dashboard with metrics

---

## ✅ Comparison: N8n vs FastAPI+React

| Feature | N8n | FastAPI + React |
|---------|-----|-----------------|
| **Setup Time** | 30 mins | 2-4 hours |
| **User Interface** | Basic | Professional, Custom |
| **Customization** | Limited (no-code) | Unlimited (full code) |
| **Scalability** | Good (100s) | Excellent (1000s+) |
| **Data Storage** | Excel file | PostgreSQL database |
| **Real-time Updates** | No | Yes |
| **Mobile Friendly** | Limited | Yes |
| **Multi-user** | No | Yes (can add auth) |
| **Cost** | $0-20/mo | $0-50/mo |
| **Learning Curve** | Easy | Medium |
| **Production Ready** | Yes | Yes |

**Choose N8n if:** You want quick setup, no coding, single user
**Choose FastAPI+React if:** You want full control, custom UI, scalability

---

## 📋 Prerequisites

### Required:
- **Python 3.10+** - [Download](https://www.python.org/downloads/)
- **Node.js 18+** - [Download](https://nodejs.org/)
- **PostgreSQL 14+** - [Download](https://www.postgresql.org/download/)
- **OpenAI API Key** - [Get it here](https://platform.openai.com/api-keys)

### Optional:
- **Docker** - [Download](https://www.docker.com/) (easier deployment)
- **Hunter.io API Key** - [Sign up](https://hunter.io/) (better email finding)

---

## 🚀 Installation (Step-by-Step)

### Part 1: Database Setup (5 minutes)

**1. Install PostgreSQL:**
```bash
# macOS
brew install postgresql
brew services start postgresql

# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql

# Windows: Download installer from postgresql.org
```

**2. Create Database:**
```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE b2b_leads;

# Create user (optional, recommended for production)
CREATE USER b2b_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE b2b_leads TO b2b_user;

# Exit
\q
```

---

### Part 2: Backend Setup (15 minutes)

**1. Extract backend code:**
```bash
cd /path/to/your/projects
tar -xzf b2b-lead-generation-backend.tar.gz
cd b2b-lead-generation/backend
```

**2. Create virtual environment:**
```bash
python -m venv venv

# Activate
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate
```

**3. Install dependencies:**
```bash
pip install -r requirements.txt
```

**4. Install Playwright (for web scraping):**
```bash
playwright install chromium
```

**5. Configure environment:**
```bash
cp .env.example .env
nano .env  # or use any text editor
```

**Update these values in .env:**
```bash
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/b2b_leads
OPENAI_API_KEY=sk-proj-your-actual-key-here

# Email (Gmail example)
SMTP_USER=your.email@gmail.com
SMTP_PASSWORD=your-gmail-app-password  # Not your regular password!
SMTP_FROM_EMAIL=your.email@gmail.com

# Your company info
MY_COMPANY_NAME=Your Company Name
MY_COMPANY_SERVICES=AI and Automation Solutions
MY_COMPANY_VALUE_PROP=We help companies reduce costs by 40% with AI
MY_COMPANY_PORTFOLIO=- AI chatbots\n- Process automation\n- CRM integrations
MY_COMPANY_WEBSITE=https://yourcompany.com
MY_COMPANY_CONTACT=you@yourcompany.com

# Generate secret key
SECRET_KEY=run_this_command_openssl_rand_hex_32
```

**How to get Gmail App Password:**
```
1. Go to Google Account → Security
2. Enable 2-Factor Authentication
3. Go to "App passwords"
4. Generate password for "Mail"
5. Copy the 16-character password
```

**6. Initialize database:**
```bash
# Create migration
alembic init alembic

# Generate initial migration
alembic revision --autogenerate -m "Initial migration"

# Run migration
alembic upgrade head
```

**7. Start backend server:**
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Test it:** Visit http://localhost:8000/docs
You should see the Swagger API documentation!

---

### Part 3: Frontend Setup (10 minutes)

**Open a NEW terminal** (keep backend running)

**1. Navigate to frontend:**
```bash
cd b2b-lead-generation/frontend
```

**2. Install dependencies:**
```bash
npm install
```

**3. Create .env file:**
```bash
echo "REACT_APP_API_URL=http://localhost:8000" > .env
```

**4. Start development server:**
```bash
npm start
```

**Test it:** Browser should open to http://localhost:3000
You should see the dashboard!

---

## 📝 Usage Guide

### 1. Upload Companies

**Create an Excel file** (companies.xlsx):
| Company_Name | Website |
|--------------|---------|
| Acme Corp | https://acmecorp.com |
| TechStart Inc | https://techstart.io |
| DataDrive | https://datadrive.com |

**In the dashboard:**
1. Click "Upload Excel"
2. Select your file
3. Wait for confirmation

### 2. Start Scraping

1. Click "Start Scraping"
2. Watch status change: Created → Scraping → Data Parsed → Drafted
3. View progress in real-time
4. Check extracted CEO/CTO/CFO emails

### 3. Review Emails

1. Find companies with status "Drafted"
2. Click "Review Email"
3. Read the AI-generated email
4. Edit subject/body if needed
5. Click "Approve & Send Later"

### 4. Send Emails

1. Once you've approved all emails
2. Click "Send Approved Emails"
3. Emails are sent with 5-second delays
4. Status changes to "Sent"

### 5. Monitor Results

- View analytics cards at top
- Track success rates
- Check email logs
- Monitor scraping progress

---

## 🔧 Development & Customization

### Backend Customization

**Add new scraping sources:**
Edit `app/services/scraper.py`
```python
async def scrape_linkedin(company_name: str):
    # Your LinkedIn scraping logic
    pass
```

**Modify email template:**
Edit `app/services/openai_service.py`
```python
# Change the prompt in generate_email_template()
prompt = f"""
Your custom email generation instructions...
"""
```

**Add new API endpoints:**
Create new file in `app/api/your_feature.py`
```python
from fastapi import APIRouter
router = APIRouter()

@router.get("/your-endpoint")
def your_endpoint():
    return {"message": "Hello"}
```

### Frontend Customization

**Change colors/theme:**
Edit `src/App.tsx`
```typescript
import { createTheme, ThemeProvider } from '@mui/material';

const theme = createTheme({
  palette: {
    primary: { main: '#your-color' },
  },
});
```

**Add new pages:**
Create `src/pages/YourPage.tsx`
```typescript
export const YourPage = () => {
  return <div>Your content</div>;
};
```

**Modify dashboard cards:**
Edit `src/components/Dashboard.tsx`

---

## 🐳 Docker Deployment (Production)

**Create docker-compose.yml:**
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: b2b_leads
      POSTGRES_PASSWORD: your_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
  
  redis:
    image: redis:7
    ports:
      - "6379:6379"
  
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://postgres:your_password@postgres:5432/b2b_leads
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - redis
    volumes:
      - ./backend:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000
  
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

volumes:
  postgres_data:
```

**Deploy:**
```bash
docker-compose up -d
```

---

## 💰 Cost Breakdown

### OpenAI API Costs (GPT-4 Turbo)
- Data extraction: ~$0.01 per company
- Email generation: ~$0.01 per company
- **Total: $0.02 per company**
- **100 companies: $2**
- **1000 companies: $20**

### Infrastructure Costs
| Service | Free Tier | Paid |
|---------|-----------|------|
| Database (PostgreSQL) | Self-hosted: $0 | AWS RDS: $15/mo |
| Backend (FastAPI) | Self-hosted: $0 | Heroku: $7/mo |
| Frontend (React) | Vercel: $0 | Netlify Pro: $19/mo |
| Email (Gmail) | 500/day: $0 | SendGrid: $15/mo |
| Total | **$0/month** | **$56/month** |

**Recommended for 100 companies/month:**
- Self-host everything: $2 (OpenAI only)
- Full cloud deployment: $58/month

---

## 🔍 Troubleshooting

### Backend won't start
```bash
# Check PostgreSQL is running
psql -U postgres -l

# Check Python version
python --version  # Should be 3.10+

# Check .env file exists
cat .env

# Check database connection
psql -U postgres -d b2b_leads
```

### Frontend won't connect to backend
```bash
# Check backend is running
curl http://localhost:8000/health

# Check REACT_APP_API_URL in .env
cat frontend/.env

# Check CORS settings in backend/app/main.py
# Should include http://localhost:3000
```

### Scraping not working
```bash
# Check Playwright is installed
playwright install chromium

# Test OpenAI API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"

# Check rate limits
# OpenAI: 3 requests/min on free tier
```

### Emails not sending
```bash
# Test Gmail app password
python -c "
import smtplib
server = smtplib.SMTP('smtp.gmail.com', 587)
server.starttls()
server.login('your@gmail.com', 'your-app-password')
print('Success!')
"

# Check SMTP settings in .env
```

---

## 📊 Performance Optimization

### For 1000+ Companies

**1. Use background workers (Celery):**
```bash
# Install
pip install celery

# Start worker
celery -A app.tasks worker --loglevel=info
```

**2. Add caching (Redis):**
```python
from redis import Redis
cache = Redis(host='localhost', port=6379)
```

**3. Database indexing:**
Already included in models (status, created_at indices)

**4. Batch processing:**
Process 10 companies at a time (configurable in .env)

---

## 🔐 Security Best Practices

### Before Production:

1. **Change SECRET_KEY:**
```bash
openssl rand -hex 32
```

2. **Enable HTTPS:**
Use Let's Encrypt or Cloudflare

3. **Add authentication:**
Implement JWT tokens or OAuth

4. **Rate limiting:**
Add FastAPI-Limiter

5. **Environment variables:**
Never commit .env files

6. **Database backups:**
```bash
pg_dump b2b_leads > backup.sql
```

---

## 📈 Scaling Checklist

- [ ] Move to cloud PostgreSQL (AWS RDS, DigitalOcean)
- [ ] Use Redis for caching
- [ ] Add Celery for background tasks
- [ ] Deploy backend to AWS/Heroku/DigitalOcean
- [ ] Deploy frontend to Vercel/Netlify
- [ ] Add CDN for static files
- [ ] Implement proper logging (ELK stack)
- [ ] Add monitoring (Sentry, New Relic)
- [ ] Set up CI/CD pipeline

---

## 🎓 Learning Resources

### FastAPI:
- Official Docs: https://fastapi.tiangolo.com
- Tutorial: https://fastapi.tiangolo.com/tutorial/

### React:
- Official Docs: https://react.dev
- MUI: https://mui.com

### OpenAI:
- API Docs: https://platform.openai.com/docs
- Best Practices: https://platform.openai.com/docs/guides/prompt-engineering

---

## ✅ Next Steps

1. ✅ Follow installation guide
2. ✅ Test with 3-5 sample companies
3. ✅ Review generated emails
4. ✅ Customize company information
5. ✅ Adjust email templates
6. ✅ Test email sending
7. ✅ Scale to 20-50 companies
8. ✅ Monitor and optimize
9. ✅ Deploy to production (optional)

---

## 🆘 Getting Help

**Issues?** Check:
1. Console logs (F12 in browser)
2. Backend logs (terminal running uvicorn)
3. Database logs (psql)

**Common Issues:**
- Port 8000 already in use: Change port in uvicorn command
- Database connection failed: Check DATABASE_URL
- CORS error: Check ALLOWED_ORIGINS in .env

---

## 🎉 You're Ready!

Your FastAPI + React + OpenAI lead generation tool is ready to use!

**Key Advantages over N8n:**
✅ Professional, custom UI
✅ Database storage (not just Excel)
✅ Full code control
✅ Scalable to 1000s of companies
✅ Real-time updates
✅ Multi-user support (can add)
✅ Mobile responsive

Start generating leads! 🚀
