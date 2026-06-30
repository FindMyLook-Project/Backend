"""Test Find Total Look end-to-end (Backend -> ML -> MongoDB)."""
import base64
import json
import sys
import requests

API = "http://localhost:3000/api/search/total-look"

if len(sys.argv) < 2:
    print("Usage: python test_total_look_backend.py path\\to\\outfit-photo.jpg")
    sys.exit(1)

path = sys.argv[1]
print(f"Photo: {path}")

with open(path, "rb") as f:
    b64 = base64.b64encode(f.read()).decode("ascii")

print("Calling backend (may take 30-60 sec)...")
r = requests.post(
    API,
    json={
        "image": f"data:image/jpeg;base64,{b64}",
        "filters": {"priceRange": 2000},
    },
    timeout=300,
)

print("Status:", r.status_code)
if r.status_code != 200:
    print(r.text[:800])
    sys.exit(1)

data = r.json()
look = data.get("look", {})
summary = look.get("summary", {})
slots = look.get("slots", [])

print()
print("=== TOTAL LOOK RESULT ===")
print(f"Garments: {summary.get('garmentCount')}  |  Total product matches: {summary.get('totalMatches')}")
print(f"Detection: {summary.get('detectionMeta', {}).get('slots')}")
print()

for slot in slots:
    det = slot.get("detected", {})
    print(f"  {slot.get('labelHe', slot.get('slotId')):12}  {det.get('color')}  ->  {slot.get('matchCount')} products")

if slots:
    print()
    print("OK — Step 2 works.")
else:
    print("No slots returned — check ML is running on port 8000.")
