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


async def send_push_notification(
    tokens: List[str],
    title: str,
    body: str,
    extra_data: Optional[dict] = None
) -> bool:
    """
    Sends a high-priority push notification to device tokens via Firebase FCM multicast batching.
    Configured with urgent priority, emergency sound channel, and actionable payload
    (escape route & precautions) that wakes devices even when the app is in the background or killed.
    """
    if not tokens or _get_firebase_app() is None:
        logger.error("Firebase configuration missing or no recipient tokens")
        return False

    unique_tokens = list(set(tokens))
    all_success = True

    payload_data = {"type": "risk-alert", "pitch": "low"}
    if extra_data:
        # Convert all extra data values to strings for FCM compatibility
        for k, v in extra_data.items():
            payload_data[str(k)] = str(v)

    android_config = messaging.AndroidConfig(
        priority="high",
        notification=messaging.AndroidNotification(
            channel_id="emergency_alerts_low_pitch",
            sound="emergency_low_pitch",
            default_vibrate_timings=True,
            priority="max"
        ),
        data=payload_data
    )

    webpush_config = messaging.WebpushConfig(
        headers={"Urgency": "high"},
        notification=messaging.WebpushNotification(
            require_interaction=True,
            vibrate=[500, 250, 500, 250, 1000],
        )
    )

    # Send in batches of 500 (FCM Multicast limit)
    for i in range(0, len(unique_tokens), 500):
        batch = unique_tokens[i:i + 500]
        try:
            message = messaging.MulticastMessage(
                tokens=batch,
                notification=messaging.Notification(title=title, body=body),
                data=payload_data,
                android=android_config,
                webpush=webpush_config,
            )
            response = messaging.send_each_for_multicast(message)
            logger.info(f"FCM batch sent: {response.success_count}/{len(batch)} delivered")
            if response.failure_count > 0:
                all_success = False
        except Exception as e:
            logger.error("Failed to send multicast batch: %s", e)
            all_success = False

    return all_success


import httpx

async def send_sms_alert(phone_numbers: List[str], message: str) -> dict:
    """
    Sends early warning SMS alerts to field officials and community contacts.
    Integrates with live Fast2SMS/Gov gateway when SMS_GATEWAY_API_KEY is configured,
    with honest fallback simulation logging when no API key is provided.
    """
    sms_key = os.getenv("SMS_GATEWAY_API_KEY")
    clean_numbers = [num.replace("+91", "").replace("-", "").replace(" ", "").strip() for num in phone_numbers if num.strip()]

    if not clean_numbers:
        return {
            "channel": "sms",
            "recipients_count": 0,
            "status": "skipped",
            "gateway": "none",
            "detail": "No valid recipient mobile numbers specified"
        }

    logger.info(f"[SMS DISPATCH] Processing alert for {len(clean_numbers)} recipients: {message}")

    # Live Gateway Dispatch (Fast2SMS Quick SMS Route)
    if sms_key and sms_key != "your_sms_gateway_api_key":
        try:
            url = "https://www.fast2sms.com/dev/bulkV2"
            headers = {
                "authorization": sms_key,
                "Content-Type": "application/json"
            }
            payload = {
                "route": "q",
                "message": message[:155], # SMS character budget
                "language": "english",
                "flash": 0,
                "numbers": ",".join(clean_numbers)
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                data = resp.json()
                if data.get("return"):
                    logger.info(f"[SMS LIVE] Successfully delivered to gateway: {data.get('request_id')}")
                    return {
                        "channel": "sms",
                        "recipients_count": len(clean_numbers),
                        "status": "delivered",
                        "gateway": "Fast2SMS-Live",
                        "request_id": data.get("request_id")
                    }
                else:
                    logger.warning(f"[SMS LIVE] Gateway returned error: {data.get('message')}")
                    return {
                        "channel": "sms",
                        "recipients_count": len(clean_numbers),
                        "status": "gateway_error",
                        "gateway": "Fast2SMS-Live",
                        "detail": data.get("message")
                    }
        except Exception as e:
            logger.error(f"[SMS LIVE] Failed to contact gateway: {e}")
            return {
                "channel": "sms",
                "recipients_count": len(clean_numbers),
                "status": "connection_error",
                "gateway": "Fast2SMS-Live",
                "detail": str(e)
            }

    # Simulation mode when SMS gateway is not configured
    return {
        "channel": "sms",
        "recipients_count": len(clean_numbers),
        "status": "simulated",
        "gateway": "Simulation (Configure SMS_GATEWAY_API_KEY in .env for live SMS)",
        "preview_message": message[:80] + "..."
    }
