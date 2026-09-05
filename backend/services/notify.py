"""
Notification Service
Sends push notifications via Firebase Cloud Messaging (FCM).
"""

import os
import logging
from typing import List, Optional
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, messaging

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _get_firebase_app():
    if firebase_admin._apps:
        return firebase_admin.get_app()

    credential_path = os.getenv("FIREBASE_CREDENTIALS_JSON")
    if not credential_path or not os.path.exists(credential_path):
        logger.error("FIREBASE_CREDENTIALS_JSON is missing or points to a nonexistent file")
        return None

    return firebase_admin.initialize_app(credentials.Certificate(credential_path))


async def send_push_notification(tokens: List[str], title: str, body: str) -> bool:
    """
    Sends a push notification to a list of device tokens using Firebase FCM.
    """
    if not tokens or _get_firebase_app() is None:
        logger.error("Firebase configuration missing")
        return False

    success = True
    for token in tokens:
        try:
            messaging.send(messaging.Message(
                token=token,
                notification=messaging.Notification(title=title, body=body),
                data={"type": "risk-alert"},
            ))
        except Exception as e:
            logger.error("Failed to send notification: %s", e)
            success = False

    return success


async def send_sms_alert(phone_numbers: List[str], message: str) -> dict:
    """
    Sends early warning SMS alerts via Fast2SMS API to field officials and community contacts.
    Falls back to automated simulation log if SMS gateway credentials are not configured.
    """
    import httpx
    import re

    sms_key = os.getenv("FAST2SMS_API_KEY") or os.getenv("SMS_GATEWAY_API_KEY")
    logger.info(f"[SMS DISPATCH] Alert queued for {len(phone_numbers)} recipients: {message}")

    # Extract 10-digit Indian phone numbers
    clean_numbers = []
    for num in phone_numbers:
        digits = re.sub(r"\D", "", num)
        if len(digits) >= 10:
            clean_numbers.append(digits[-10:])

    if sms_key and clean_numbers:
        try:
            url = "https://www.fast2sms.com/dev/bulkV2"
            payload = {
                "route": "v3",
                "sender_id": "TXTIND",
                "message": message[:160], # 160 char limit for single SMS
                "language": "english",
                "flash": 0,
                "numbers": ",".join(clean_numbers)
            }
            headers = {
                "authorization": sms_key,
                "Content-Type": "application/json"
            }

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                res_data = response.json()
                logger.info(f"[FAST2SMS RESPONSE] {res_data}")

                return {
                    "channel": "sms",
                    "recipients_count": len(clean_numbers),
                    "status": "delivered_fast2sms" if res_data.get("return") else "failed_fast2sms",
                    "gateway": "Fast2SMS Bulk V3",
                    "api_response": res_data
                }
        except Exception as e:
            logger.error(f"[FAST2SMS ERROR] Failed to send SMS: {e}")
            return {
                "channel": "sms",
                "recipients_count": len(clean_numbers),
                "status": f"error: {str(e)}",
                "gateway": "Fast2SMS Bulk V3"
            }

    return {
        "channel": "sms",
        "recipients_count": len(phone_numbers),
        "status": "delivered_simulated" if not sms_key else "no_valid_numbers",
        "gateway": "Simulated-Telecom-Gateway"
    }
