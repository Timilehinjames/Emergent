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
    region: str = "North"

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
            "region": "North",
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
    "Massy Stores - Trincity": {"lat": 10.6364, "lng": -61.3487, "region": "North"},
    "Massy Stores - Gulf City": {"lat": 10.2833, "lng": -61.4667, "region": "South"},
    "Massy Stores - Price Plaza": {"lat": 10.5167, "lng": -61.4000, "region": "Central"},
    "PriceSmart - Chaguanas": {"lat": 10.5167, "lng": -61.4119, "region": "Central"},
    "PriceSmart - Trincity": {"lat": 10.6364, "lng": -61.3487, "region": "North"},
    "Pennywise - San Fernando": {"lat": 10.2833, "lng": -61.4667, "region": "South"},
    "Pennywise - Chaguanas": {"lat": 10.5167, "lng": -61.4119, "region": "Central"},
    "Pennywise - Port of Spain": {"lat": 10.6596, "lng": -61.5086, "region": "North"},
    "Hi-Lo - Maraval": {"lat": 10.6833, "lng": -61.5333, "region": "North"},
    "Hi-Lo - Valsayn": {"lat": 10.6417, "lng": -61.4167, "region": "North"},
    "JTA Supermarket - Arima": {"lat": 10.6333, "lng": -61.2833, "region": "North"},
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

@api_router.get("/gas-stations")
async def get_gas_stations():
    stations = await db.gas_stations.find({}, {"_id": 0}).to_list(50)
    return stations

# ============ SCAN / OCR ============

@api_router.post("/scan/shelf-tag")
async def scan_shelf_tag(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    image_base64 = body.get("image_base64", "")
    if not image_base64:
        raise HTTPException(status_code=400, detail="image_base64 required")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="OCR service not configured")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"scan_{uuid.uuid4().hex[:8]}",
            system_message="You are a price tag reader for Trinidad and Tobago supermarkets. Extract the product name, price in TTD, quantity, and unit from shelf tags or receipts. Return ONLY valid JSON with keys: product_name, price (number), store_name (if visible), quantity (number), unit (string like 'g', 'kg', 'ml', 'L', 'each', 'pack'), raw_text (any other text you see). If you can't read something, set it as empty string or 0."
        )
        chat.with_model("openai", "gpt-5.2")
        image_content = ImageContent(image_base64=image_base64)
        user_message = UserMessage(
            text="Read this shelf tag or receipt and extract the product name, price, quantity, and unit. Return ONLY valid JSON.",
            file_contents=[image_content]
        )
        response = await chat.send_message(user_message)
        # Try to parse JSON from response
        try:
            # Clean response - find JSON in the response
            resp_text = response.strip()
            if resp_text.startswith("```"):
                resp_text = resp_text.split("```")[1]
                if resp_text.startswith("json"):
                    resp_text = resp_text[4:]
            result = json.loads(resp_text)
        except json.JSONDecodeError:
            result = {"raw_text": response, "product_name": "", "price": 0, "store_name": "", "quantity": 0, "unit": ""}
        return {
            "product_name": result.get("product_name", ""),
            "price": float(result.get("price", 0)),
            "store_name": result.get("store_name", ""),
            "quantity": float(result.get("quantity", 0)),
            "unit": result.get("unit", ""),
            "raw_text": result.get("raw_text", "")
        }
    except Exception as e:
        logger.error(f"OCR scan error: {e}")
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")

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

# ============ DATABASE SEEDING ============

async def seed_database():
    # Seed stores
    store_count = await db.stores.count_documents({})
    if store_count == 0:
        stores = [
            {"store_id": "store_massy_trincity", "name": "Massy Stores - Trincity", "type": "supermarket", "region": "North", "lat": 10.6364, "lng": -61.3487},
            {"store_id": "store_massy_gulf", "name": "Massy Stores - Gulf City", "type": "supermarket", "region": "South", "lat": 10.2833, "lng": -61.4667},
            {"store_id": "store_massy_price", "name": "Massy Stores - Price Plaza", "type": "supermarket", "region": "Central", "lat": 10.5167, "lng": -61.4000},
            {"store_id": "store_ps_chag", "name": "PriceSmart - Chaguanas", "type": "wholesale", "region": "Central", "lat": 10.5167, "lng": -61.4119},
            {"store_id": "store_ps_trinc", "name": "PriceSmart - Trincity", "type": "wholesale", "region": "North", "lat": 10.6364, "lng": -61.3487},
            {"store_id": "store_pw_sf", "name": "Pennywise - San Fernando", "type": "pharmacy", "region": "South", "lat": 10.2833, "lng": -61.4667},
            {"store_id": "store_pw_chag", "name": "Pennywise - Chaguanas", "type": "pharmacy", "region": "Central", "lat": 10.5167, "lng": -61.4119},
            {"store_id": "store_pw_pos", "name": "Pennywise - Port of Spain", "type": "pharmacy", "region": "North", "lat": 10.6596, "lng": -61.5086},
            {"store_id": "store_hilo_mar", "name": "Hi-Lo - Maraval", "type": "supermarket", "region": "North", "lat": 10.6833, "lng": -61.5333},
            {"store_id": "store_jta_arima", "name": "JTA Supermarket - Arima", "type": "supermarket", "region": "North", "lat": 10.6333, "lng": -61.2833},
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
    # Seed gas stations (mocked)
    gas_count = await db.gas_stations.count_documents({})
    if gas_count == 0:
        gas_stations = [
            {"station_id": "gas_1", "name": "NP - Trincity", "brand": "NP", "lat": 10.6350, "lng": -61.3500, "region": "North", "price_per_litre": 5.97, "fuel_type": "Super"},
            {"station_id": "gas_2", "name": "NP - Chaguanas", "brand": "NP", "lat": 10.5200, "lng": -61.4100, "region": "Central", "price_per_litre": 5.97, "fuel_type": "Super"},
            {"station_id": "gas_3", "name": "Unipet - Curepe", "brand": "Unipet", "lat": 10.6417, "lng": -61.4000, "region": "North", "price_per_litre": 5.97, "fuel_type": "Super"},
            {"station_id": "gas_4", "name": "NP - San Fernando", "brand": "NP", "lat": 10.2800, "lng": -61.4600, "region": "South", "price_per_litre": 5.97, "fuel_type": "Super"},
            {"station_id": "gas_5", "name": "Unipet - Scarborough", "brand": "Unipet", "lat": 11.1833, "lng": -60.7333, "region": "Tobago", "price_per_litre": 5.97, "fuel_type": "Super"},
        ]
        await db.gas_stations.insert_many(gas_stations)
        logger.info("Seeded gas stations")
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token")
    await db.products.create_index("name")
    await db.products.create_index("category")
    await db.price_reports.create_index("product_id")
    await db.price_reports.create_index("store_name")
    await db.price_reports.create_index([("created_at", -1)])

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
