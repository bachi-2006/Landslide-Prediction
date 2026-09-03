"""
Notification Service
Sends push notifications via Firebase Cloud Messaging (FCM).
"""

import httpx
import os
import logging
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def send_push_notification(tokens: List[str], title: str, body: str) -> bool:
    """
    Sends a push notification to a list of device tokens using Firebase FCM.
    """
    server_key = os.getenv("FIREBASE_SERVER_KEY")
    project_id = os.getenv("FIREBASE_PROJECT_ID")

    if not server_key or not project_id:
        logger.error("Firebase configuration missing")
        return False

    # Legacy FCM API (Server Key)
    url = f"https://fcm.googleapis.com/fcm/send"
    headers = {
        "Authorization": f"key={server_key}",
        "Content-Type": "application/json"
    }

    # We send individually or use multicast. For simplicity in MVP:
    success = True
    async with httpx.AsyncClient() as client:
        for token in tokens:
            payload = {
                "to": token,
                "notification": {
                    "title": title,
                    "body": body,
                    "sound": "default"
                },
                "priority": "high"
            }
            try:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
            except Exception as e:
                logger.error(f"Failed to send notification to {token}: {e}")
                success = False

    return success
