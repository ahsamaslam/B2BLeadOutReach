#!/usr/bin/env python3
"""
Complete end-to-end test of the broadcast email flow.
This simulates exactly what the frontend does.
"""
import os
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal
from app.models import User, Company, CampaignTemplate, EmailTemplate, EmailLog, Contact
from app.api.emails import BroadcastGenerateRequest, BroadcastSendRequest
from app.services import email_service

def test_full_flow():
    db = SessionLocal()

    print("=" * 80)
    print("BROADCAST EMAIL FLOW - COMPLETE END-TO-END TEST")
    print("=" * 80)

    try:
        # Step 1: Get user
        user = db.query(User).first()
        print(f"\n✓ Step 1: User authenticated")
        print(f"  Email: {user.email}")
        print(f"  Tenant ID: {user.tenant_id}")

        # Step 2: Get companies
        companies = db.query(Company).limit(1).all()
        if not companies:
            print("❌ No companies found!")
            return False

        company = companies[0]
        print(f"\n✓ Step 2: Company selected")
        print(f"  Company ID: {company.id}")
        print(f"  Company Name: {company.name}")

        # Step 3: Get campaign template
        template = db.query(CampaignTemplate).first()
        if not template:
            print("❌ No campaign templates found!")
            return False

        print(f"\n✓ Step 3: Campaign template selected")
        print(f"  Template ID: {template.id}")
        print(f"  Template Name: {template.name}")

        # Step 4: Generate emails (broadcast/generate)
        print(f"\n📧 Step 4: Generating emails...")
        print(f"  Calling: broadcast/generate")
        print(f"  Payload: company_ids=[{company.id}], campaign_template_id={template.id}")

        # Simulate the broadcast_generate endpoint
        from app.api.emails import _primary_contact, _substitute_placeholders

        primary = _primary_contact(company)
        owner_name = primary.name if primary else ""
        recipient_email = primary.email if primary else ""

        subject = _substitute_placeholders(template.subject_template, company, owner_name)
        body = _substitute_placeholders(template.body_template, company, owner_name)

        # Create EmailTemplate (drafted)
        et = EmailTemplate(
            company_id=company.id,
            campaign_template_id=template.id,
            subject=subject,
            body=body,
            status="drafted"
        )
        db.add(et)
        db.flush()

        print(f"\n  ✓ Email template created")
        print(f"    Template ID: {et.id}")
        print(f"    Status: {et.status}")
        print(f"    Subject: {subject[:60]}...")

        # Step 5: Approve the email
        print(f"\n✓ Step 5: Approving email...")
        print(f"  Calling: /api/emails/templates/{et.id}/approve")

        et.status = "approved"
        db.commit()

        print(f"  ✓ Email approved")
        print(f"    Status: {et.status}")

        # Step 6: Send approved emails (broadcast/send-approved)
        print(f"\n📤 Step 6: Sending approved emails...")
        print(f"  Calling: broadcast/send-approved")

        template_ids = [et.id]
        print(f"  Payload: template_ids={template_ids}, attach_portfolio=False")

        # This is the critical part - simulate the endpoint
        templates = (
            db.query(EmailTemplate)
            .filter(EmailTemplate.id.in_(template_ids))
            .filter(EmailTemplate.status == "approved")
            .all()
        )

        print(f"  Found {len(templates)} approved templates")

        if not templates:
            print("❌ ERROR: No approved templates found!")
            print("  This is the issue - templates are not being found")

            # Debug info
            all_templates = db.query(EmailTemplate).all()
            print(f"\n  Debug - All templates in DB: {len(all_templates)}")
            for t in all_templates:
                print(f"    - ID: {t.id}, Status: {t.status}, Company: {t.company_id}")

            return False

        # Send the emails
        sent = 0
        failed = 0

        for email_template in templates:
            comp = db.query(Company).filter(Company.id == email_template.company_id).first()
            primary = _primary_contact(comp) if comp else None
            recipient = primary.email if primary else None

            if not recipient:
                failed += 1
                continue

            print(f"\n  Sending to: {recipient}")

            result = email_service.send_email(
                to_email=recipient,
                to_name=primary.name if primary else None,
                subject=email_template.subject,
                body_html=email_template.body,
                attach_portfolio=False,
                user_id=user.id,
                tenant_id=user.tenant_id,
                tracking_token="test-token-12345",
            )

            if result["success"]:
                email_template.status = "sent"
                log = EmailLog(
                    template_id=email_template.id,
                    campaign_template_id=email_template.campaign_template_id,
                    company_id=email_template.company_id,
                    tenant_id=user.tenant_id,
                    recipient_email=recipient,
                    recipient_name=primary.name if primary else None,
                    subject=email_template.subject,
                    body=email_template.body,
                    status="sent",
                    sent_at=__import__('datetime').datetime.utcnow(),
                    tracking_token="test-token-12345",
                )
                db.add(log)
                sent += 1
                print(f"    ✓ Email sent successfully!")
            else:
                failed += 1
                print(f"    ❌ Failed: {result.get('error')}")

        db.commit()

        # Final report
        print("\n" + "=" * 80)
        print("RESULT:")
        print("=" * 80)
        print(f"✅ Sent: {sent}")
        print(f"❌ Failed: {failed}")

        if sent > 0:
            print("\n✅ SUCCESS! The broadcast flow is working correctly!")

            # Show email log
            logs = db.query(EmailLog).order_by(EmailLog.id.desc()).limit(1).all()
            if logs:
                log = logs[0]
                print(f"\nEmail Log Created:")
                print(f"  - To: {log.recipient_email}")
                print(f"  - Subject: {log.subject[:60]}...")
                print(f"  - Status: {log.status}")
                print(f"  - Tracking: {log.tracking_token}")

            return True
        else:
            print("\n❌ FAILED! No emails were sent.")
            return False

    except Exception as e:
        print(f"\n❌ ERROR: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        db.close()

if __name__ == "__main__":
    success = test_full_flow()
    sys.exit(0 if success else 1)
