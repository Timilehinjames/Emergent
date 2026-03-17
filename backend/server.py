from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
import json
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import httpx
import hashlib

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
JWT_SECRET = os.environ.get('JWT_SECRET', 'trinisaver-jwt-secret-key-2026-secure-32b')
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 7

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============ MODELS ============

class UserRegister(BaseModel):
    email: str
    password: str
    name: str
    region: str = "East-West Corridor"

class UserLogin(BaseModel):
    email: str
    password: str

class UserProfile(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str = ""
    region: str = "North"
    is_pricesmart_member: bool = False
    points: int = 0
    created_at: str = ""

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    region: Optional[str] = None
    is_pricesmart_member: Optional[bool] = None

class PriceReportCreate(BaseModel):
    product_name: str
    store_name: str
    price: float
    quantity: float = 1.0
    unit: str = "each"
    photo_base64: Optional[str] = None

class UnitPriceCompare(BaseModel):
    items: List[dict]

class TripPlanRequest(BaseModel):
    store_ids: List[str]
    time_of_day: str = "morning"

class ScanResult(BaseModel):
    product_name: str = ""
    price: float = 0.0
    store_name: str = ""
    unit: str = ""
    quantity: float = 0.0
    raw_text: str = ""

# ============ AUTH HELPERS ============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_jwt(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    # Try JWT first
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0})
        if user:
            return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        pass
    # Try session token (Google OAuth)
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if user:
            return user
    raise HTTPException(status_code=401, detail="Invalid token")

# ============ AUTH ROUTES ============

@api_router.post("/auth/register")
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": data.email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "picture": "",
        "region": data.region,
        "is_pricesmart_member": False,
        "points": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    token = create_jwt(user_id)
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    return {"token": token, "user": user_doc}

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_jwt(user["user_id"])
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"token": token, "user": user}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    user.pop("password_hash", None)
    return user

@api_router.post("/auth/google-session")
async def exchange_google_session(request: Request):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    async with httpx.AsyncClient() as http_client:
        resp = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = resp.json()
    email = data.get("email")
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data.get("session_token", "")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "password_hash": "",
            "name": name,
            "picture": picture,
            "region": "East-West Corridor",
            "is_pricesmart_member": False,
            "points": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_doc)
    session_doc = {
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    }
    await db.user_sessions.insert_one(session_doc)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    user.pop("password_hash", None)
    response = Response(content=json.dumps({"token": session_token, "user": user}, default=str), media_type="application/json")
    response.set_cookie("session_token", session_token, path="/", secure=True, httponly=True, samesite="none", max_age=7*24*3600)
    return response

@api_router.post("/auth/logout")
async def logout(request: Request):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response = Response(content=json.dumps({"message": "Logged out"}), media_type="application/json")
    response.delete_cookie("session_token", path="/")
    return response

# ============ PRODUCTS & STORES ============

@api_router.get("/products")
async def get_products(search: str = "", category: str = ""):
    query = {}
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    if category:
        query["category"] = category
    products = await db.products.find(query, {"_id": 0}).to_list(100)
    return products

@api_router.get("/products/{product_id}/prices")
async def get_product_prices(product_id: str):
    reports = await db.price_reports.find(
        {"product_id": product_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return reports

@api_router.get("/stores")
async def get_stores():
    stores = await db.stores.find({}, {"_id": 0}).to_list(100)
    return stores

@api_router.post("/stores")
async def create_store(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    name = body.get("name", "").strip()
    store_type = body.get("type", "supermarket")
    region = body.get("region", "East-West Corridor")
    lat = float(body.get("lat", 0))
    lng = float(body.get("lng", 0))
    if not name:
        raise HTTPException(status_code=400, detail="Store name is required")
    existing = await db.stores.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Store already exists")
    store_id = f"store_{uuid.uuid4().hex[:8]}"
    store_doc = {
        "store_id": store_id,
        "name": name,
        "type": store_type,
        "region": region,
        "lat": lat,
        "lng": lng,
        "added_by": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.stores.insert_one(store_doc)
    # Also add to trip planner locations
    TT_STORES_LOCATIONS[name] = {"lat": lat, "lng": lng, "region": region}
    # Award points for adding a store
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"points": 5}})
    store_doc.pop("_id", None)
    return {"store": store_doc, "points_earned": 5}

@api_router.get("/categories")
async def get_categories():
    categories = await db.products.distinct("category")
    return categories

# ============ PRICE REPORTS ============

@api_router.post("/price-reports")
async def create_price_report(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    product_name = body.get("product_name", "")
    store_name = body.get("store_name", "")
    price = float(body.get("price", 0))
    quantity = float(body.get("quantity", 1))
    unit = body.get("unit", "each")
    photo_base64 = body.get("photo_base64", "")
    # Dedup: check image hash if photo provided
    image_hash = ""
    if photo_base64 and len(photo_base64) > 50:
        image_hash = hashlib.sha256(photo_base64[:5000].encode()).hexdigest()
        dup_by_image = await db.price_reports.find_one({
            "image_hash": image_hash,
            "$or": [
                {"reporter_user_id": user["user_id"]},
                {"store_name": store_name}
            ]
        }, {"_id": 0})
        if dup_by_image:
            raise HTTPException(status_code=409, detail="This image has already been submitted for this store")
    # Dedup: same user, same product, same store, same price within 24h
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    dup_by_content = await db.price_reports.find_one({
        "product_name": {"$regex": f"^{product_name}$", "$options": "i"},
        "store_name": store_name,
        "price": price,
        "$or": [
            {"reporter_user_id": user["user_id"]},
        ],
        "created_at": {"$gte": cutoff}
    }, {"_id": 0})
    if dup_by_content:
        raise HTTPException(status_code=409, detail="You already reported this price for this product at this store today")
    # Calculate unit price
    unit_price = price / quantity if quantity > 0 else price
    # Find or create product
    product = await db.products.find_one({"name": {"$regex": f"^{product_name}$", "$options": "i"}}, {"_id": 0})
    if not product:
        product_id = f"prod_{uuid.uuid4().hex[:8]}"
        product = {
            "product_id": product_id,
            "name": product_name,
            "category": "General",
            "brand": "",
            "unit_type": unit
        }
        await db.products.insert_one(product)
    else:
        product_id = product["product_id"]
    report_id = f"rpt_{uuid.uuid4().hex[:8]}"
    report = {
        "report_id": report_id,
        "product_id": product_id,
        "product_name": product_name,
        "store_name": store_name,
        "price": price,
        "quantity": quantity,
        "unit": unit,
        "unit_price": round(unit_price, 2),
        "reporter_user_id": user["user_id"],
        "reporter_name": user.get("name", "Anonymous"),
        "verified": False,
        "photo_base64": photo_base64[:100] if photo_base64 else "",
        "image_hash": image_hash,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.price_reports.insert_one(report)
    # Award points
    points_earned = 10 if photo_base64 else 5
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$inc": {"points": points_earned}}
    )
    report.pop("_id", None)
    return {"report": report, "points_earned": points_earned}

@api_router.get("/price-reports/recent")
async def get_recent_reports(limit: int = 20):
    reports = await db.price_reports.find(
        {},
        {"_id": 0, "photo_base64": 0}
    ).sort("created_at", -1).to_list(limit)
    return reports

# ============ FLAG AS OUTDATED ============

FLAG_THRESHOLD = 3  # Number of flags before auto-marking as outdated

# Admin emails (hardcoded for MVP - can be moved to DB later)
ADMIN_EMAILS = ["admin@trinisaver.com", "admin@test.com"]

async def require_admin(request: Request) -> dict:
    """Check if user is admin"""
    user = await get_current_user(request)
    if user.get("email") not in ADMIN_EMAILS and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

@api_router.post("/flag/{item_type}/{item_id}")
async def flag_as_outdated(item_type: str, item_id: str, request: Request):
    user = await get_current_user(request)
    if item_type not in ("report", "special"):
        raise HTTPException(status_code=400, detail="item_type must be 'report' or 'special'")
    collection = db.price_reports if item_type == "report" else db.specials
    id_field = "report_id" if item_type == "report" else "special_id"
    item = await collection.find_one({id_field: item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    # Check if user already flagged
    flagged_by = item.get("flagged_by", [])
    if user["user_id"] in flagged_by:
        raise HTTPException(status_code=409, detail="You already flagged this as outdated")
    flagged_by.append(user["user_id"])
    flag_count = len(flagged_by)
    is_outdated = flag_count >= FLAG_THRESHOLD
    update = {
        "$set": {
            "flagged_by": flagged_by,
            "flag_count": flag_count,
            "is_outdated": is_outdated,
        }
    }
    if is_outdated:
        update["$set"]["outdated_at"] = datetime.now(timezone.utc).isoformat()
        # Allow re-submission by clearing the dedup hash
        update["$set"]["image_hash"] = ""
    await collection.update_one({id_field: item_id}, update)
    # Award 2 points for flagging
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"points": 2}})
    return {
        "flag_count": flag_count,
        "is_outdated": is_outdated,
        "points_earned": 2,
        "message": "Marked as outdated! This price can now be re-reported." if is_outdated else f"Flagged ({flag_count}/{FLAG_THRESHOLD} needed to mark outdated)"
    }

# ============ UNIT PRICE COMPARISON ============

UNIT_CONVERSIONS = {
    "kg": {"g": 1000, "lb": 2.20462, "oz": 35.274},
    "L": {"ml": 1000, "fl_oz": 33.814, "gal": 0.264172},
    "each": {"pack": 1, "roll": 1, "unit": 1},
}

def normalize_unit_price(price: float, quantity: float, unit: str) -> dict:
    unit_lower = unit.lower()
    base_unit = "each"
    base_quantity = quantity
    if unit_lower in ["g", "gram", "grams"]:
        base_unit = "100g"
        base_quantity = quantity / 100
    elif unit_lower in ["kg", "kilogram"]:
        base_unit = "100g"
        base_quantity = quantity * 10
    elif unit_lower in ["lb", "pound"]:
        base_unit = "100g"
        base_quantity = quantity * 4.53592
    elif unit_lower in ["oz", "ounce"]:
        base_unit = "100g"
        base_quantity = quantity * 0.283495
    elif unit_lower in ["ml", "millilitre"]:
        base_unit = "L"
        base_quantity = quantity / 1000
    elif unit_lower in ["l", "litre", "liter"]:
        base_unit = "L"
        base_quantity = quantity
    elif unit_lower in ["fl_oz", "fluid_ounce"]:
        base_unit = "L"
        base_quantity = quantity * 0.0295735
    else:
        base_unit = unit
        base_quantity = quantity
    unit_price = price / base_quantity if base_quantity > 0 else price
    return {"unit_price": round(unit_price, 2), "per_unit": base_unit}

@api_router.post("/compare/unit-price")
async def compare_unit_prices(request: Request):
    body = await request.json()
    items = body.get("items", [])
    results = []
    for item in items:
        norm = normalize_unit_price(
            float(item.get("price", 0)),
            float(item.get("quantity", 1)),
            item.get("unit", "each")
        )
        results.append({
            "store_name": item.get("store_name", "Unknown"),
            "product_name": item.get("product_name", ""),
            "original_price": item.get("price"),
            "quantity": item.get("quantity"),
            "unit": item.get("unit"),
            "unit_price": norm["unit_price"],
            "per_unit": norm["per_unit"]
        })
    results.sort(key=lambda x: x["unit_price"])
    cheapest = results[0] if results else None
    savings = 0
    if len(results) > 1:
        savings = round(results[-1]["unit_price"] - results[0]["unit_price"], 2)
    return {"results": results, "cheapest": cheapest, "potential_savings_per_unit": savings}

# ============ TRIP PLANNER (MOCKED) ============

TT_STORES_LOCATIONS = {
    "Massy Stores - Trincity": {"lat": 10.6364, "lng": -61.3487, "region": "East-West Corridor"},
    "Massy Stores - Gulf City": {"lat": 10.2833, "lng": -61.4667, "region": "South"},
    "Massy Stores - Price Plaza": {"lat": 10.5167, "lng": -61.4000, "region": "Central"},
    "PriceSmart - Chaguanas": {"lat": 10.5167, "lng": -61.4119, "region": "Central"},
    "PriceSmart - Trincity": {"lat": 10.6364, "lng": -61.3487, "region": "East-West Corridor"},
    "Pennywise - San Fernando": {"lat": 10.2833, "lng": -61.4667, "region": "South"},
    "Pennywise - Chaguanas": {"lat": 10.5167, "lng": -61.4119, "region": "Central"},
    "Pennywise - Port of Spain": {"lat": 10.6596, "lng": -61.5086, "region": "West"},
    "Hi-Lo - Maraval": {"lat": 10.6833, "lng": -61.5333, "region": "West"},
    "Hi-Lo - Valsayn": {"lat": 10.6417, "lng": -61.4167, "region": "East-West Corridor"},
    "JTA Supermarket - Arima": {"lat": 10.6333, "lng": -61.2833, "region": "North East"},
}

MOCK_TRAFFIC_PATTERNS = {
    "morning": {"multiplier": 1.3, "label": "Moderate", "peak": False},
    "midday": {"multiplier": 1.0, "label": "Light", "peak": False},
    "afternoon": {"multiplier": 1.5, "label": "Moderate-Heavy", "peak": False},
    "evening_rush": {"multiplier": 2.2, "label": "Heavy", "peak": True},
    "night": {"multiplier": 1.0, "label": "Light", "peak": False},
}

import math
def haversine_distance(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c

@api_router.post("/trip/plan")
async def plan_trip(request: Request):
    body = await request.json()
    store_names = body.get("stores", [])
    time_of_day = body.get("time_of_day", "midday")
    traffic = MOCK_TRAFFIC_PATTERNS.get(time_of_day, MOCK_TRAFFIC_PATTERNS["midday"])
    if len(store_names) < 1:
        raise HTTPException(status_code=400, detail="At least one store required")
    legs = []
    total_distance = 0
    total_time = 0
    for i in range(len(store_names) - 1):
        s1 = TT_STORES_LOCATIONS.get(store_names[i])
        s2 = TT_STORES_LOCATIONS.get(store_names[i+1])
        if s1 and s2:
            dist = haversine_distance(s1["lat"], s1["lng"], s2["lat"], s2["lng"])
            base_time = (dist / 40) * 60  # minutes at 40km/h avg
            adjusted_time = base_time * traffic["multiplier"]
            legs.append({
                "from": store_names[i],
                "to": store_names[i+1],
                "distance_km": round(dist, 1),
                "base_time_min": round(base_time),
                "adjusted_time_min": round(adjusted_time),
                "traffic": traffic["label"]
            })
            total_distance += dist
            total_time += adjusted_time
    is_worth_it = True
    suggestion = "This trip looks efficient!"
    if traffic["peak"] and len(store_names) > 1:
        is_worth_it = False
        suggestion = f"Traffic is {traffic['label']}! Consider a single-store trip to save ~{round(total_time)} minutes of driving. The extra $30 TTD at one store could save you significant time."
    return {
        "legs": legs,
        "total_distance_km": round(total_distance, 1),
        "total_time_min": round(total_time),
        "traffic_condition": traffic["label"],
        "is_peak": traffic["peak"],
        "is_worth_it": is_worth_it,
        "suggestion": suggestion,
        "time_of_day": time_of_day
    }

# ============ SCAN / OCR ============

@api_router.post("/scan/shelf-tag")
async def scan_shelf_tag(request: Request):
    _user = await get_current_user(request)  # Require auth but don't use user data
    body = await request.json()
    image_base64 = body.get("image_base64", "")
    scan_type = body.get("scan_type", "single")  # "single", "receipt", "flyer"
    if not image_base64:
        raise HTTPException(status_code=400, detail="image_base64 required")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="OCR service not configured")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        if scan_type == "receipt":
            system_msg = "You are a receipt reader for Trinidad and Tobago supermarkets. Extract ALL items from this receipt. Return ONLY valid JSON with key 'items' containing an array. Each item has: product_name (string), price (number in TTD), quantity (number, default 1), unit (string like 'each', 'kg', 'L', 'pack'). Also include 'store_name' (string) and 'total' (number) at the top level if visible. If unsure, leave as empty string or 0."
            user_text = "Read this supermarket receipt and extract ALL line items with product names and prices. Return a JSON object with 'items' array, 'store_name', and 'total'."
        elif scan_type == "flyer":
            system_msg = "You are a sales flyer reader for Trinidad and Tobago stores. Extract ALL deals/specials from this flyer image. Return ONLY valid JSON with key 'items' containing an array. Each item has: product_name (string), price (number in TTD, the sale price), original_price (number, if shown), quantity (number, default 1), unit (string), discount_text (string, e.g. '20% OFF' or 'Buy 1 Get 1'). Also include 'store_name' (string) and 'valid_until' (string date if visible) at the top level."
            user_text = "Read this sales flyer and extract ALL deals and special prices. Return a JSON object with 'items' array, 'store_name', and 'valid_until'."
        else:
            system_msg = "You are a price tag reader for Trinidad and Tobago supermarkets. Extract the product name, price in TTD, quantity, and unit from shelf tags. Return ONLY valid JSON with keys: product_name, price (number), store_name (if visible), quantity (number), unit (string like 'g', 'kg', 'ml', 'L', 'each', 'pack'), raw_text (any other text you see). If you can't read something, set it as empty string or 0."
            user_text = "Read this shelf tag and extract the product name, price, quantity, and unit. Return ONLY valid JSON."
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"scan_{uuid.uuid4().hex[:8]}",
            system_message=system_msg
        )
        chat.with_model("openai", "gpt-5.2")
        image_content = ImageContent(image_base64=image_base64)
        user_message = UserMessage(text=user_text, file_contents=[image_content])
        response = await chat.send_message(user_message)
        try:
            resp_text = response.strip()
            if resp_text.startswith("```"):
                resp_text = resp_text.split("```")[1]
                if resp_text.startswith("json"):
                    resp_text = resp_text[4:]
            result = json.loads(resp_text)
        except json.JSONDecodeError:
            result = {"raw_text": response, "items": []}
        if scan_type in ("receipt", "flyer"):
            items = result.get("items", [])
            return {
                "scan_type": scan_type,
                "store_name": result.get("store_name", "") or "",
                "total": float(result.get("total", 0) or 0),
                "valid_until": result.get("valid_until", "") or "",
                "items": [{
                    "product_name": (i.get("product_name", "") or ""),
                    "price": float(i.get("price", 0) or 0),
                    "original_price": float(i.get("original_price", 0) or 0),
                    "quantity": float(i.get("quantity", 1) or 1),
                    "unit": (i.get("unit", "each") or "each"),
                    "discount_text": (i.get("discount_text", "") or ""),
                } for i in items if i.get("product_name")],
                "item_count": len(items),
                "raw_text": result.get("raw_text", "") or ""
            }
        else:
            return {
                "scan_type": "single",
                "product_name": result.get("product_name", "") or "",
                "price": float(result.get("price", 0) or 0),
                "store_name": result.get("store_name", "") or "",
                "quantity": float(result.get("quantity", 0) or 0),
                "unit": result.get("unit", "") or "",
                "raw_text": result.get("raw_text", "") or ""
            }
    except Exception as e:
        logger.error(f"OCR scan error: {e}")
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")

# ============ SPECIALS / SALES ============

@api_router.post("/specials")
async def create_special(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    store_name = body.get("store_name", "")
    items = body.get("items", [])
    valid_until = body.get("valid_until", "")
    photo_base64 = body.get("photo_base64", "")
    title = body.get("title", f"Sale at {store_name}")
    # Dedup: check image hash if photo provided
    image_hash = ""
    if photo_base64 and len(photo_base64) > 50:
        image_hash = hashlib.sha256(photo_base64[:5000].encode()).hexdigest()
        dup_by_image = await db.specials.find_one({
            "image_hash": image_hash,
            "$or": [
                {"posted_by_user_id": user["user_id"]},
                {"store_name": store_name}
            ]
        }, {"_id": 0})
        if dup_by_image:
            raise HTTPException(status_code=409, detail="This flyer has already been posted for this store")
    # Dedup: same user, same store, same title within 24h
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    dup_by_content = await db.specials.find_one({
        "title": {"$regex": f"^{title}$", "$options": "i"},
        "store_name": {"$regex": f"^{store_name}$", "$options": "i"} if store_name else {"$exists": True},
        "$or": [
            {"posted_by_user_id": user["user_id"]},
        ],
        "created_at": {"$gte": cutoff}
    }, {"_id": 0})
    if dup_by_content:
        raise HTTPException(status_code=409, detail="You already posted a special with this title for this store today")
    special_id = f"spc_{uuid.uuid4().hex[:8]}"
    special_doc = {
        "special_id": special_id,
        "title": title,
        "store_name": store_name,
        "items": items,
        "valid_until": valid_until,
        "photo_base64": photo_base64[:200] if photo_base64 else "",
        "image_hash": image_hash,
        "posted_by_user_id": user["user_id"],
        "posted_by_name": user.get("name", "Anonymous"),
        "region": user.get("region", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.specials.insert_one(special_doc)
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"points": 15}})
    special_doc.pop("_id", None)
    return {"special": special_doc, "points_earned": 15}

@api_router.get("/specials")
async def get_specials(region: str = "", limit: int = 20):
    query = {}
    if region:
        query["region"] = region
    specials = await db.specials.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return specials

@api_router.get("/specials/{special_id}")
async def get_special(special_id: str):
    special = await db.specials.find_one({"special_id": special_id}, {"_id": 0})
    if not special:
        raise HTTPException(status_code=404, detail="Special not found")
    return special

# ============ AD BANNERS ============

@api_router.get("/banners")
async def get_banners():
    banners = await db.banners.find({"active": True}, {"_id": 0}).sort("priority", -1).to_list(10)
    return banners

# ============ COMMUNITY & LEADERBOARD ============

@api_router.get("/leaderboard")
async def get_leaderboard(region: str = ""):
    query = {}
    if region:
        query["region"] = region
    users = await db.users.find(
        query,
        {"_id": 0, "password_hash": 0}
    ).sort("points", -1).to_list(50)
    leaderboard = []
    for i, u in enumerate(users):
        leaderboard.append({
            "rank": i + 1,
            "user_id": u["user_id"],
            "name": u.get("name", "Anonymous"),
            "region": u.get("region", ""),
            "points": u.get("points", 0),
            "picture": u.get("picture", "")
        })
    return leaderboard

@api_router.get("/community/stats")
async def get_community_stats():
    total_users = await db.users.count_documents({})
    total_reports = await db.price_reports.count_documents({})
    recent_reports = await db.price_reports.find(
        {},
        {"_id": 0, "photo_base64": 0}
    ).sort("created_at", -1).to_list(10)
    return {
        "total_users": total_users,
        "total_reports": total_reports,
        "recent_reports": recent_reports
    }

# ============ PROFILE & SAVINGS ============

@api_router.get("/profile")
async def get_profile(request: Request):
    user = await get_current_user(request)
    user.pop("password_hash", None)
    report_count = await db.price_reports.count_documents({"reporter_user_id": user["user_id"]})
    user["report_count"] = report_count
    return user

@api_router.put("/profile")
async def update_profile(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    update_fields = {}
    if "name" in body:
        update_fields["name"] = body["name"]
    if "region" in body:
        update_fields["region"] = body["region"]
    if "is_pricesmart_member" in body:
        update_fields["is_pricesmart_member"] = body["is_pricesmart_member"]
    if update_fields:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update_fields})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    updated.pop("password_hash", None)
    return updated

@api_router.get("/savings-summary")
async def get_savings_summary(request: Request):
    user = await get_current_user(request)
    reports = await db.price_reports.find(
        {"reporter_user_id": user["user_id"]},
        {"_id": 0}
    ).to_list(100)
    total_reports = len(reports)
    estimated_savings = total_reports * 8.50  # Avg savings per report in TTD
    return {
        "total_reports": total_reports,
        "estimated_savings_ttd": round(estimated_savings, 2),
        "points": user.get("points", 0),
        "this_month_reports": sum(1 for r in reports if r.get("created_at", "").startswith(datetime.now(timezone.utc).strftime("%Y-%m"))),
        "this_month_savings": round(sum(1 for r in reports if r.get("created_at", "").startswith(datetime.now(timezone.utc).strftime("%Y-%m"))) * 8.50, 2)
    }

# ============ PENNYWISE SPLIT LOGIC ============

PENNYWISE_CATEGORIES = ["Toiletries", "Cosmetics", "Cleaning", "Personal Care", "Household Chemicals"]

@api_router.post("/compare/pennywise-split")
async def pennywise_split(request: Request):
    body = await request.json()
    shopping_list = body.get("items", [])
    pennywise_items = []
    other_items = []
    for item in shopping_list:
        category = item.get("category", "General")
        if category in PENNYWISE_CATEGORIES:
            pennywise_items.append({**item, "suggested_store": "Pennywise"})
        else:
            other_items.append({**item, "suggested_store": item.get("preferred_store", "Massy Stores")})
    return {
        "pennywise_items": pennywise_items,
        "other_store_items": other_items,
        "split_recommended": len(pennywise_items) > 0 and len(other_items) > 0,
        "tip": "Pennywise typically has lower prices on toiletries, cosmetics, and household chemicals in T&T."
    }

# ============ STORE LOCATIONS (for map) ============

@api_router.get("/store-locations")
async def get_store_locations():
    locations = []
    for name, info in TT_STORES_LOCATIONS.items():
        locations.append({
            "name": name,
            "lat": info["lat"],
            "lng": info["lng"],
            "region": info["region"]
        })
    return locations

# ============ SHOPPING LISTS ============

@api_router.post("/shopping-lists")
async def create_shopping_list(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    list_name = body.get("name", "My Shopping List")
    items = body.get("items", [])
    list_id = f"list_{uuid.uuid4().hex[:8]}"
    list_doc = {
        "list_id": list_id,
        "user_id": user["user_id"],
        "name": list_name,
        "items": items,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.shopping_lists.insert_one(list_doc)
    list_doc.pop("_id", None)
    return list_doc

@api_router.get("/shopping-lists")
async def get_shopping_lists(request: Request):
    user = await get_current_user(request)
    lists = await db.shopping_lists.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(50)
    return lists

@api_router.put("/shopping-lists/{list_id}")
async def update_shopping_list(list_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    update_fields = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "name" in body:
        update_fields["name"] = body["name"]
    if "items" in body:
        update_fields["items"] = body["items"]
    result = await db.shopping_lists.update_one(
        {"list_id": list_id, "user_id": user["user_id"]},
        {"$set": update_fields}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="List not found")
    updated = await db.shopping_lists.find_one({"list_id": list_id}, {"_id": 0})
    return updated

@api_router.delete("/shopping-lists/{list_id}")
async def delete_shopping_list(list_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.shopping_lists.delete_one({"list_id": list_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="List not found")
    return {"message": "List deleted"}

@api_router.get("/product-categories")
async def get_product_categories():
    """Returns products grouped by category for the shopping list builder."""
    products = await db.products.find({}, {"_id": 0}).to_list(200)
    categories = {}
    for p in products:
        cat = p.get("category", "General")
        if cat not in categories:
            categories[cat] = []
        categories[cat].append({
            "product_id": p["product_id"],
            "name": p["name"],
            "brand": p.get("brand", ""),
            "unit_type": p.get("unit_type", "each")
        })
    return categories

# ============ DATABASE SEEDING ============

async def seed_database():
    # Seed stores
    store_count = await db.stores.count_documents({})
    if store_count == 0:
        stores = [
            {"store_id": "store_massy_trincity", "name": "Massy Stores - Trincity", "type": "supermarket", "region": "East-West Corridor", "lat": 10.6364, "lng": -61.3487},
            {"store_id": "store_massy_gulf", "name": "Massy Stores - Gulf City", "type": "supermarket", "region": "South", "lat": 10.2833, "lng": -61.4667},
            {"store_id": "store_massy_price", "name": "Massy Stores - Price Plaza", "type": "supermarket", "region": "Central", "lat": 10.5167, "lng": -61.4000},
            {"store_id": "store_ps_chag", "name": "PriceSmart - Chaguanas", "type": "wholesale", "region": "Central", "lat": 10.5167, "lng": -61.4119},
            {"store_id": "store_ps_trinc", "name": "PriceSmart - Trincity", "type": "wholesale", "region": "East-West Corridor", "lat": 10.6364, "lng": -61.3487},
            {"store_id": "store_pw_sf", "name": "Pennywise - San Fernando", "type": "pharmacy", "region": "South", "lat": 10.2833, "lng": -61.4667},
            {"store_id": "store_pw_chag", "name": "Pennywise - Chaguanas", "type": "pharmacy", "region": "Central", "lat": 10.5167, "lng": -61.4119},
            {"store_id": "store_pw_pos", "name": "Pennywise - Port of Spain", "type": "pharmacy", "region": "West", "lat": 10.6596, "lng": -61.5086},
            {"store_id": "store_hilo_mar", "name": "Hi-Lo - Maraval", "type": "supermarket", "region": "West", "lat": 10.6833, "lng": -61.5333},
            {"store_id": "store_jta_arima", "name": "JTA Supermarket - Arima", "type": "supermarket", "region": "North East", "lat": 10.6333, "lng": -61.2833},
        ]
        await db.stores.insert_many(stores)
        logger.info("Seeded stores")
    # Seed products
    prod_count = await db.products.count_documents({})
    if prod_count == 0:
        products = [
            {"product_id": "prod_rice_5kg", "name": "Curepe Long Grain Rice 5kg", "category": "Grains & Rice", "brand": "Curepe", "unit_type": "kg"},
            {"product_id": "prod_rice_2kg", "name": "Curepe Long Grain Rice 2kg", "category": "Grains & Rice", "brand": "Curepe", "unit_type": "kg"},
            {"product_id": "prod_oil_5L", "name": "Coconut Oil 5L", "category": "Cooking Oil", "brand": "Eve", "unit_type": "L"},
            {"product_id": "prod_oil_1L", "name": "Coconut Oil 1L", "category": "Cooking Oil", "brand": "Eve", "unit_type": "L"},
            {"product_id": "prod_flour_2kg", "name": "All Purpose Flour 2kg", "category": "Baking", "brand": "National", "unit_type": "kg"},
            {"product_id": "prod_sugar_2kg", "name": "White Sugar 2kg", "category": "Baking", "brand": "Demerara", "unit_type": "kg"},
            {"product_id": "prod_chicken_whole", "name": "Whole Chicken (per kg)", "category": "Meat & Poultry", "brand": "", "unit_type": "kg"},
            {"product_id": "prod_milk_1L", "name": "Full Cream Milk 1L", "category": "Dairy", "brand": "Anchor", "unit_type": "L"},
            {"product_id": "prod_tissue_12", "name": "Toilet Tissue 12-Pack", "category": "Toiletries", "brand": "Charmin", "unit_type": "pack"},
            {"product_id": "prod_tissue_4", "name": "Toilet Tissue 4-Pack", "category": "Toiletries", "brand": "Charmin", "unit_type": "pack"},
            {"product_id": "prod_detergent_2kg", "name": "Laundry Detergent 2kg", "category": "Cleaning", "brand": "Breeze", "unit_type": "kg"},
            {"product_id": "prod_soap_3pk", "name": "Bath Soap 3-Pack", "category": "Personal Care", "brand": "Dove", "unit_type": "pack"},
            {"product_id": "prod_toothpaste", "name": "Colgate Toothpaste 150ml", "category": "Personal Care", "brand": "Colgate", "unit_type": "ml"},
            {"product_id": "prod_carib_6", "name": "Carib Lager 6-Pack", "category": "Beverages", "brand": "Carib", "unit_type": "pack"},
            {"product_id": "prod_crix_3", "name": "Crix Crackers 3-Pack", "category": "Snacks", "brand": "Bermudez", "unit_type": "pack"},
        ]
        await db.products.insert_many(products)
        logger.info("Seeded products")
    # Seed price reports (sample data)
    report_count = await db.price_reports.count_documents({})
    if report_count == 0:
        sample_reports = [
            {"report_id": "rpt_s1", "product_id": "prod_rice_5kg", "product_name": "Curepe Long Grain Rice 5kg", "store_name": "Massy Stores - Trincity", "price": 89.99, "quantity": 5, "unit": "kg", "unit_price": 18.00, "reporter_user_id": "system", "reporter_name": "TriniSaver", "verified": True, "photo_base64": "", "created_at": datetime.now(timezone.utc).isoformat()},
            {"report_id": "rpt_s2", "product_id": "prod_rice_5kg", "product_name": "Curepe Long Grain Rice 5kg", "store_name": "PriceSmart - Chaguanas", "price": 79.99, "quantity": 5, "unit": "kg", "unit_price": 16.00, "reporter_user_id": "system", "reporter_name": "TriniSaver", "verified": True, "photo_base64": "", "created_at": datetime.now(timezone.utc).isoformat()},
            {"report_id": "rpt_s3", "product_id": "prod_rice_2kg", "product_name": "Curepe Long Grain Rice 2kg", "store_name": "Hi-Lo - Maraval", "price": 42.99, "quantity": 2, "unit": "kg", "unit_price": 21.50, "reporter_user_id": "system", "reporter_name": "TriniSaver", "verified": True, "photo_base64": "", "created_at": datetime.now(timezone.utc).isoformat()},
            {"report_id": "rpt_s4", "product_id": "prod_oil_5L", "product_name": "Coconut Oil 5L", "store_name": "PriceSmart - Chaguanas", "price": 145.00, "quantity": 5, "unit": "L", "unit_price": 29.00, "reporter_user_id": "system", "reporter_name": "TriniSaver", "verified": True, "photo_base64": "", "created_at": datetime.now(timezone.utc).isoformat()},
            {"report_id": "rpt_s5", "product_id": "prod_oil_1L", "product_name": "Coconut Oil 1L", "store_name": "Massy Stores - Gulf City", "price": 39.99, "quantity": 1, "unit": "L", "unit_price": 39.99, "reporter_user_id": "system", "reporter_name": "TriniSaver", "verified": True, "photo_base64": "", "created_at": datetime.now(timezone.utc).isoformat()},
            {"report_id": "rpt_s6", "product_id": "prod_tissue_12", "product_name": "Toilet Tissue 12-Pack", "store_name": "Pennywise - San Fernando", "price": 49.99, "quantity": 12, "unit": "roll", "unit_price": 4.17, "reporter_user_id": "system", "reporter_name": "TriniSaver", "verified": True, "photo_base64": "", "created_at": datetime.now(timezone.utc).isoformat()},
            {"report_id": "rpt_s7", "product_id": "prod_tissue_4", "product_name": "Toilet Tissue 4-Pack", "store_name": "Massy Stores - Trincity", "price": 24.99, "quantity": 4, "unit": "roll", "unit_price": 6.25, "reporter_user_id": "system", "reporter_name": "TriniSaver", "verified": True, "photo_base64": "", "created_at": datetime.now(timezone.utc).isoformat()},
            {"report_id": "rpt_s8", "product_id": "prod_detergent_2kg", "product_name": "Laundry Detergent 2kg", "store_name": "Pennywise - Chaguanas", "price": 34.99, "quantity": 2, "unit": "kg", "unit_price": 17.50, "reporter_user_id": "system", "reporter_name": "TriniSaver", "verified": True, "photo_base64": "", "created_at": datetime.now(timezone.utc).isoformat()},
        ]
        await db.price_reports.insert_many(sample_reports)
        logger.info("Seeded price reports")
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token")
    await db.products.create_index("name")
    await db.products.create_index("category")
    await db.price_reports.create_index("product_id")
    await db.price_reports.create_index("store_name")
    await db.price_reports.create_index([("created_at", -1)])
    await db.price_reports.create_index("image_hash")
    await db.specials.create_index([("created_at", -1)])
    await db.specials.create_index("region")
    await db.specials.create_index("image_hash")
    await db.banners.create_index("active")
    # Seed banners
    banner_count = await db.banners.count_documents({})
    if banner_count == 0:
        banners = [
            {"banner_id": "ban_1", "title": "Advertise Here", "subtitle": "Reach thousands of T&T shoppers daily", "cta_text": "Learn More", "cta_url": "", "bg_color": "#0277BD", "text_color": "#FFFFFF", "active": True, "priority": 10},
            {"banner_id": "ban_2", "title": "Your Business Here", "subtitle": "Promote your store specials to savvy shoppers", "cta_text": "Contact Us", "cta_url": "", "bg_color": "#2E7D32", "text_color": "#FFFFFF", "active": True, "priority": 5},
            {"banner_id": "ban_3", "title": "Featured Partner", "subtitle": "Premium ad placement available for T&T businesses", "cta_text": "Get Started", "cta_url": "", "bg_color": "#E65100", "text_color": "#FFFFFF", "active": True, "priority": 3},
        ]
        await db.banners.insert_many(banners)
        logger.info("Seeded banners")

# ============ ADMIN PANEL ENDPOINTS ============

@api_router.get("/admin/stats")
async def admin_get_stats(request: Request):
    """Get overall admin dashboard statistics"""
    await require_admin(request)
    total_users = await db.users.count_documents({})
    total_reports = await db.price_reports.count_documents({})
    total_specials = await db.specials.count_documents({})
    total_stores = await db.stores.count_documents({})
    flagged_reports = await db.price_reports.count_documents({"flag_count": {"$gte": 1}})
    flagged_specials = await db.specials.count_documents({"flag_count": {"$gte": 1}})
    outdated_reports = await db.price_reports.count_documents({"is_outdated": True})
    outdated_specials = await db.specials.count_documents({"is_outdated": True})
    pending_stores = await db.stores.count_documents({"status": "pending"})
    # Recent activity (last 7 days)
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    new_users_week = await db.users.count_documents({"created_at": {"$gte": week_ago}})
    new_reports_week = await db.price_reports.count_documents({"created_at": {"$gte": week_ago}})
    return {
        "total_users": total_users,
        "total_reports": total_reports,
        "total_specials": total_specials,
        "total_stores": total_stores,
        "flagged_reports": flagged_reports,
        "flagged_specials": flagged_specials,
        "outdated_reports": outdated_reports,
        "outdated_specials": outdated_specials,
        "pending_stores": pending_stores,
        "new_users_week": new_users_week,
        "new_reports_week": new_reports_week,
    }

@api_router.get("/admin/users")
async def admin_get_users(request: Request, limit: int = 50, skip: int = 0, search: str = ""):
    """Get all users for admin management"""
    await require_admin(request)
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.users.count_documents(query)
    return {"users": users, "total": total}

@api_router.put("/admin/users/{user_id}")
async def admin_update_user(user_id: str, request: Request):
    """Update user (ban, set admin, adjust points)"""
    await require_admin(request)
    body = await request.json()
    update_fields = {}
    if "is_banned" in body:
        update_fields["is_banned"] = body["is_banned"]
    if "is_admin" in body:
        update_fields["is_admin"] = body["is_admin"]
    if "points" in body:
        update_fields["points"] = int(body["points"])
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.users.update_one({"user_id": user_id}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User updated", "updated_fields": list(update_fields.keys())}

@api_router.get("/admin/flagged")
async def admin_get_flagged(request: Request, item_type: str = "all"):
    """Get flagged reports and specials for review"""
    await require_admin(request)
    result = {"reports": [], "specials": []}
    if item_type in ("all", "reports"):
        reports = await db.price_reports.find(
            {"flag_count": {"$gte": 1}},
            {"_id": 0, "photo_base64": 0}
        ).sort("flag_count", -1).to_list(50)
        result["reports"] = reports
    if item_type in ("all", "specials"):
        specials = await db.specials.find(
            {"flag_count": {"$gte": 1}},
            {"_id": 0, "photo_base64": 0}
        ).sort("flag_count", -1).to_list(50)
        result["specials"] = specials
    return result

@api_router.delete("/admin/reports/{report_id}")
async def admin_delete_report(report_id: str, request: Request):
    """Delete a price report (admin only)"""
    await require_admin(request)
    result = await db.price_reports.delete_one({"report_id": report_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"message": "Report deleted"}

@api_router.delete("/admin/specials/{special_id}")
async def admin_delete_special(special_id: str, request: Request):
    """Delete a special (admin only)"""
    await require_admin(request)
    result = await db.specials.delete_one({"special_id": special_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Special not found")
    return {"message": "Special deleted"}

@api_router.put("/admin/clear-flags/{item_type}/{item_id}")
async def admin_clear_flags(item_type: str, item_id: str, request: Request):
    """Clear flags from an item (admin decided it's valid)"""
    await require_admin(request)
    if item_type not in ("report", "special"):
        raise HTTPException(status_code=400, detail="item_type must be 'report' or 'special'")
    collection = db.price_reports if item_type == "report" else db.specials
    id_field = "report_id" if item_type == "report" else "special_id"
    result = await collection.update_one(
        {id_field: item_id},
        {"$set": {"flagged_by": [], "flag_count": 0, "is_outdated": False, "outdated_at": None}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Flags cleared"}

@api_router.get("/admin/stores")
async def admin_get_stores(request: Request, status: str = "all"):
    """Get stores for admin review (including pending user-added stores)"""
    await require_admin(request)
    query = {}
    if status != "all":
        query["status"] = status
    stores = await db.stores.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return stores

@api_router.put("/admin/stores/{store_id}")
async def admin_update_store(store_id: str, request: Request):
    """Approve/reject/edit a store"""
    await require_admin(request)
    body = await request.json()
    update_fields = {}
    if "status" in body:
        update_fields["status"] = body["status"]  # "approved", "rejected", "pending"
    if "name" in body:
        update_fields["name"] = body["name"]
    if "region" in body:
        update_fields["region"] = body["region"]
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.stores.update_one({"store_id": store_id}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"message": "Store updated"}

@api_router.delete("/admin/stores/{store_id}")
async def admin_delete_store(store_id: str, request: Request):
    """Delete a store (admin only)"""
    await require_admin(request)
    result = await db.stores.delete_one({"store_id": store_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"message": "Store deleted"}

@api_router.get("/admin/banners")
async def admin_get_banners(request: Request):
    """Get all banners for admin management"""
    await require_admin(request)
    banners = await db.banners.find({}, {"_id": 0}).sort("priority", -1).to_list(50)
    return banners

@api_router.post("/admin/banners")
async def admin_create_banner(request: Request):
    """Create a new ad banner"""
    await require_admin(request)
    body = await request.json()
    banner_id = f"ban_{uuid.uuid4().hex[:8]}"
    banner = {
        "banner_id": banner_id,
        "title": body.get("title", ""),
        "subtitle": body.get("subtitle", ""),
        "cta_text": body.get("cta_text", "Learn More"),
        "cta_url": body.get("cta_url", ""),
        "bg_color": body.get("bg_color", "#0277BD"),
        "text_color": body.get("text_color", "#FFFFFF"),
        "active": body.get("active", True),
        "priority": int(body.get("priority", 1)),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.banners.insert_one(banner)
    banner.pop("_id", None)
    return banner

@api_router.put("/admin/banners/{banner_id}")
async def admin_update_banner(banner_id: str, request: Request):
    """Update a banner"""
    await require_admin(request)
    body = await request.json()
    update_fields = {}
    for field in ["title", "subtitle", "cta_text", "cta_url", "bg_color", "text_color", "active", "priority"]:
        if field in body:
            update_fields[field] = body[field]
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.banners.update_one({"banner_id": banner_id}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Banner not found")
    return {"message": "Banner updated"}

@api_router.delete("/admin/banners/{banner_id}")
async def admin_delete_banner(banner_id: str, request: Request):
    """Delete a banner"""
    await require_admin(request)
    result = await db.banners.delete_one({"banner_id": banner_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Banner not found")
    return {"message": "Banner deleted"}

@api_router.get("/admin/check")
async def admin_check(request: Request):
    """Check if current user is admin"""
    user = await get_current_user(request)
    is_admin = user.get("email") in ADMIN_EMAILS or user.get("is_admin", False)
    return {"is_admin": is_admin}

# ============ ADMIN PRODUCT MANAGEMENT ============

@api_router.get("/admin/products")
async def admin_get_products(request: Request, category: str = "", search: str = ""):
    """Get all products for admin categorization"""
    await require_admin(request)
    query = {}
    if category:
        query["category"] = category
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    products = await db.products.find(query, {"_id": 0}).sort("name", 1).to_list(200)
    return products

@api_router.put("/admin/products/{product_id}")
async def admin_update_product(product_id: str, request: Request):
    """Update product category and details"""
    await require_admin(request)
    body = await request.json()
    update_fields = {}
    if "category" in body:
        update_fields["category"] = body["category"]
    if "name" in body:
        update_fields["name"] = body["name"]
    if "unit_type" in body:
        update_fields["unit_type"] = body["unit_type"]
    if "brand" in body:
        update_fields["brand"] = body["brand"]
    if "tags" in body:
        update_fields["tags"] = body["tags"]  # e.g., ["toiletry", "pennywise-special"]
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.products.update_one({"product_id": product_id}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product updated"}

@api_router.post("/admin/products")
async def admin_create_product(request: Request):
    """Create a new product"""
    await require_admin(request)
    body = await request.json()
    if not body.get("name") or not body.get("category"):
        raise HTTPException(status_code=400, detail="Name and category required")
    product = {
        "product_id": f"prod_{uuid.uuid4().hex[:8]}",
        "name": body["name"],
        "category": body["category"],
        "unit_type": body.get("unit_type", "each"),
        "brand": body.get("brand", ""),
        "tags": body.get("tags", []),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.products.insert_one(product)
    product.pop("_id", None)
    return product

@api_router.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: str, request: Request):
    """Delete a product"""
    await require_admin(request)
    result = await db.products.delete_one({"product_id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}

# ============ SMART SPLIT SHOPPING LIST ============

# Store specialties - what each store is known for offering best prices on
STORE_SPECIALTIES = {
    "PriceSmart": {
        "categories": ["Meat & Poultry", "Dairy", "Beverages"],
        "tags": ["bulk", "wholesale"],
        "savings_percent": 15,
        "membership_required": True,
    },
    "Pennywise": {
        "categories": ["Toiletries", "Personal Care", "Cleaning"],
        "tags": ["toiletry", "pennywise-special"],
        "savings_percent": 20,
        "membership_required": False,
    },
    "Massy Stores": {
        "categories": ["General", "Snacks", "Beverages"],
        "tags": [],
        "savings_percent": 5,
        "membership_required": False,
    },
    "JTA Supermarket": {
        "categories": ["Grains & Rice", "Cooking Oil", "Baking"],
        "tags": ["local", "staples"],
        "savings_percent": 10,
        "membership_required": False,
    },
    "Xtra Foods": {
        "categories": ["Meat & Poultry", "Grains & Rice"],
        "tags": [],
        "savings_percent": 8,
        "membership_required": False,
    },
}

# Mocked traffic data for Trinidad zones
ZONE_TRAFFIC = {
    "Port of Spain": {"peak_delay_mins": 45, "off_peak_delay_mins": 15},
    "San Fernando": {"peak_delay_mins": 35, "off_peak_delay_mins": 12},
    "Chaguanas": {"peak_delay_mins": 40, "off_peak_delay_mins": 15},
    "East-West Corridor": {"peak_delay_mins": 50, "off_peak_delay_mins": 20},
    "North": {"peak_delay_mins": 25, "off_peak_delay_mins": 10},
    "South": {"peak_delay_mins": 30, "off_peak_delay_mins": 12},
    "Central": {"peak_delay_mins": 35, "off_peak_delay_mins": 15},
    "Tobago": {"peak_delay_mins": 15, "off_peak_delay_mins": 8},
}

def is_peak_hours():
    """Check if current time is peak traffic hours (7-9 AM or 4-7 PM)"""
    now = datetime.now()
    hour = now.hour
    return (7 <= hour <= 9) or (16 <= hour <= 19)

@api_router.post("/smart-split")
async def smart_split_list(request: Request):
    """Analyze a shopping list and suggest optimal store splits"""
    user = await get_current_user(request)
    body = await request.json()
    items = body.get("items", [])
    user_region = body.get("region", user.get("region", "East-West Corridor"))
    is_pricesmart_member = body.get("is_pricesmart_member", False)
    prefer_single_store = body.get("prefer_single_store", False)
    
    if not items:
        return {"splits": [], "message": "No items provided"}
    
    # Group items by best store
    store_items: dict = {}
    item_assignments: dict = {}
    
    for item in items:
        item_name = item.get("name", "")
        item_category = item.get("category", "General")
        item_tags = item.get("tags", [])
        
        # Find best store for this item
        best_store = "Massy Stores"  # Default
        best_savings = 0
        
        for store_name, specialty in STORE_SPECIALTIES.items():
            # Skip PriceSmart if not a member
            if specialty["membership_required"] and not is_pricesmart_member:
                continue
            
            score = 0
            if item_category in specialty["categories"]:
                score += specialty["savings_percent"]
            for tag in item_tags:
                if tag in specialty["tags"]:
                    score += 5
            
            if score > best_savings:
                best_savings = score
                best_store = store_name
        
        # Assign item to store
        if best_store not in store_items:
            store_items[best_store] = []
        store_items[best_store].append({
            **item,
            "estimated_savings_percent": best_savings,
        })
        item_assignments[item_name] = best_store
    
    # Calculate traffic considerations
    is_peak = is_peak_hours()
    traffic_data = ZONE_TRAFFIC.get(user_region, {"peak_delay_mins": 30, "off_peak_delay_mins": 15})
    delay_per_store = traffic_data["peak_delay_mins"] if is_peak else traffic_data["off_peak_delay_mins"]
    
    num_stores = len(store_items)
    total_travel_time = num_stores * delay_per_store
    
    # Build splits response
    splits = []
    total_estimated_savings = 0
    
    for store_name, store_item_list in store_items.items():
        specialty = STORE_SPECIALTIES.get(store_name, {})
        avg_savings = sum(i.get("estimated_savings_percent", 0) for i in store_item_list) / len(store_item_list) if store_item_list else 0
        total_estimated_savings += avg_savings * len(store_item_list)
        
        splits.append({
            "store": store_name,
            "items": store_item_list,
            "item_count": len(store_item_list),
            "specialties": specialty.get("categories", []),
            "membership_required": specialty.get("membership_required", False),
            "average_savings_percent": round(avg_savings, 1),
        })
    
    # Sort by item count (most items first)
    splits.sort(key=lambda x: x["item_count"], reverse=True)
    
    # Generate recommendation
    if prefer_single_store or (is_peak and total_travel_time > 60):
        # Recommend single store trip
        main_store = splits[0]["store"] if splits else "Massy Stores"
        recommendation = {
            "type": "single_store",
            "reason": f"Heavy traffic detected ({delay_per_store} min delays). Single store trip recommended.",
            "suggested_store": main_store,
            "estimated_time_saved": total_travel_time - delay_per_store,
        }
    else:
        recommendation = {
            "type": "multi_store",
            "reason": f"Split your list across {num_stores} stores for maximum savings.",
            "stores": [s["store"] for s in splits],
            "estimated_total_time": total_travel_time,
        }
    
    return {
        "splits": splits,
        "recommendation": recommendation,
        "traffic_status": {
            "is_peak_hours": is_peak,
            "region": user_region,
            "delay_per_store_mins": delay_per_store,
            "total_estimated_travel_mins": total_travel_time,
        },
        "total_items": len(items),
        "stores_needed": num_stores,
        "average_savings_percent": round(total_estimated_savings / len(items), 1) if items else 0,
    }

@api_router.get("/traffic-status")
async def get_traffic_status(request: Request):
    """Get current traffic status for user's region"""
    user = await get_current_user(request)
    region = user.get("region", "East-West Corridor")
    is_peak = is_peak_hours()
    traffic_data = ZONE_TRAFFIC.get(region, {"peak_delay_mins": 30, "off_peak_delay_mins": 15})
    
    return {
        "region": region,
        "is_peak_hours": is_peak,
        "current_delay_mins": traffic_data["peak_delay_mins"] if is_peak else traffic_data["off_peak_delay_mins"],
        "peak_delay_mins": traffic_data["peak_delay_mins"],
        "off_peak_delay_mins": traffic_data["off_peak_delay_mins"],
        "recommendation": "Consider single-store trip" if is_peak else "Good time for multi-store trip",
    }

@app.on_event("startup")
async def startup():
    await seed_database()
    logger.info("TriniSaver API started")

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
