#!/usr/bin/env python3
"""
Test the complete broadcast email flow using HTTP API calls.
This is exactly what the frontend does.
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000"
EMAIL = "syed.ahsam@gmail.com"
PASSWORD = "RBxTWktQAlqd!35"

def test_api_flow():
    session = requests.Session()

    print("=" * 80)
    print("BROADCAST EMAIL FLOW - HTTP API TEST")
    print("=" * 80)

    # Step 1: Login
    print("\n📝 Step 1: Login...")
    login_response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD}
    )
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.text}")
        return False

    token = login_response.json().get("access_token")
    session.headers["Authorization"] = f"Bearer {token}"
    print(f"✅ Login successful")
    print(f"   Token: {token[:20]}...")

    # Step 2: Get companies
    print("\n📝 Step 2: Get companies...")
    companies_response = session.get(f"{BASE_URL}/api/companies?limit=500")
    if companies_response.status_code != 200:
        print(f"❌ Failed to get companies: {companies_response.text}")
        return False

    companies = companies_response.json()
    if isinstance(companies, dict):
        companies = companies.get("companies", [])

    if not companies:
        print("❌ No companies found")
        return False

    company = companies[0]
    company_id = company["id"]
    print(f"✅ Found {len(companies)} companies")
    print(f"   Selected: {company['name']} (ID: {company_id})")

    # Step 3: Get campaign templates
    print("\n📝 Step 3: Get campaign templates...")
    templates_response = session.get(f"{BASE_URL}/api/emails/campaign-templates")
    if templates_response.status_code != 200:
        print(f"❌ Failed to get templates: {templates_response.text}")
        return False

    templates = templates_response.json()
    if not templates:
        print("❌ No campaign templates found")
        return False

    template = templates[0]
    template_id = template["id"]
    print(f"✅ Found {len(templates)} campaign templates")
    print(f"   Selected: {template['name']} (ID: {template_id})")

    # Step 4: Generate emails (broadcast/generate)
    print(f"\n📝 Step 4: Generate emails...")
    print(f"   Calling: POST /api/emails/broadcast/generate")
    print(f"   Payload: company_ids=[{company_id}], campaign_template_id={template_id}")

    generate_response = session.post(
        f"{BASE_URL}/api/emails/broadcast/generate",
        json={
            "company_ids": [company_id],
            "campaign_template_id": template_id,
            "attach_portfolio": False,
            "use_ai": False,
        }
    )

    if generate_response.status_code != 200:
        print(f"❌ Generation failed: {generate_response.text}")
        return False

    generate_data = generate_response.json()
    results = generate_data.get("results", [])

    if not results:
        print("❌ No emails generated")
        return False

    result = results[0]
    email_template_id = result["template_id"]
    print(f"✅ Generated {len(results)} email(s)")
    print(f"   Template ID: {email_template_id}")
    print(f"   Status: {result['status']}")
    print(f"   Subject: {result['subject'][:60]}...")

    # Step 5: Approve the email
    print(f"\n📝 Step 5: Approve email...")
    print(f"   Calling: POST /api/emails/templates/{email_template_id}/approve")

    approve_response = session.post(
        f"{BASE_URL}/api/emails/templates/{email_template_id}/approve"
    )

    if approve_response.status_code != 200:
        print(f"❌ Approval failed: {approve_response.text}")
        return False

    approve_data = approve_response.json()
    print(f"✅ Email approved")
    print(f"   Status: {approve_data['status']}")

    # Step 6: Send approved emails (broadcast/send-approved)
    print(f"\n📝 Step 6: Send approved emails...")
    print(f"   Calling: POST /api/emails/broadcast/send-approved")
    print(f"   Payload: template_ids=[{email_template_id}], attach_portfolio=False")

    send_response = session.post(
        f"{BASE_URL}/api/emails/broadcast/send-approved",
        json={
            "template_ids": [email_template_id],
            "attach_portfolio": False,
        }
    )

    if send_response.status_code != 200:
        print(f"❌ Send failed: {send_response.text}")
        return False

    send_data = send_response.json()
    print(f"✅ Send request processed")
    print(f"   Sent: {send_data['sent']}")
    print(f"   Failed: {send_data['failed']}")
    print(f"   Errors: {send_data['errors']}")

    # Final report
    print("\n" + "=" * 80)
    print("RESULT:")
    print("=" * 80)

    if send_data["sent"] > 0:
        print(f"✅ SUCCESS! {send_data['sent']} email(s) sent!")
        return True
    else:
        print(f"❌ FAILED! {send_data['failed']} email(s) failed to send.")
        if send_data["errors"]:
            for error in send_data["errors"]:
                print(f"   - {error}")
        return False

if __name__ == "__main__":
    try:
        success = test_api_flow()
        import sys
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ ERROR: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        import sys
        sys.exit(1)
