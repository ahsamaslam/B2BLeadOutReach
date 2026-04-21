from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.database import engine, Base
from app.api import auth, companies, scraping, emails, analytics, portfolio as portfolio_api

# Create database tables
Base.metadata.create_all(bind=engine)

# Ensure upload folder exists
Path("/app/uploads/portfolio").mkdir(parents=True, exist_ok=True)

# Initialize FastAPI app
app = FastAPI(
    title="B2B Lead Generation API",
    description="Automated B2B lead generation and outreach system with AI-powered email generation",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(companies.router, prefix="/api/companies", tags=["Companies"])
app.include_router(scraping.router, prefix="/api/scraping", tags=["Scraping"])
app.include_router(emails.router, prefix="/api/emails", tags=["Emails"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(portfolio_api.router, prefix="/api/portfolio", tags=["Portfolio"])

# Serve uploaded files at /uploads/<filename>
app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")

@app.get("/")
def root():
    """API root endpoint"""
    return {
        "message": "B2B Lead Generation API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "database": "connected"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
