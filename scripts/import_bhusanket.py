"""Import the generated Bhusanket inventory into Supabase.

Run from the repository root after applying supabase/schema.sql:
    python scripts/import_bhusanket.py
"""

from pathlib import Path
import csv
import os

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.environ["SUPABASE_URL"]
key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
client = create_client(url, key)
source = Path("data/landslides/bhusanket_inventory.csv")

rows = []
with source.open(encoding="utf-8", newline="") as file:
    for row in csv.DictReader(file):
        rows.append({
            "source_key": f"{row['source_row']}:{row['slide_no']}",
            "source_row": row["source_row"],
            "slide_no": row["slide_no"],
            "state": row["state"],
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
            "raw_text": row["raw_text"],
        })

for offset in range(0, len(rows), 500):
    client.table("historical_landslides").upsert(
        rows[offset:offset + 500],
        on_conflict="source_key",
    ).execute()

print(f"Imported {len(rows)} historical landslide records.")
