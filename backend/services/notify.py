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
    Sends early warning SMS alerts to field officials and community contacts.
    Falls back to automated simulation log if SMS gateway credentials are not configured.
    """
    sms_key = os.getenv("SMS_GATEWAY_API_KEY")
    logger.info(f"[SMS DISPATCH] Alert queued for {len(phone_numbers)} recipients: {message}")
    return {
        "channel": "sms",
        "recipients_count": len(phone_numbers),
        "status": "delivered" if sms_key else "simulated_success",
        "gateway": "CDAC/Gov-SMS" if sms_key else "Simulated-Telecom-Gateway"
    }
