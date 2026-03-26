"""
image_routes.py
─────────────────────────────────────────────────────────────────────────────
Product image upload, management, and visual comparison endpoints.
─────────────────────────────────────────────────────────────────────────────
"""

import io
import base64
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from PIL import Image
from bson import ObjectId

router = APIRouter()

# Will be set by server.py after import
db = None

# ─── Helper Functions ─────────────────────────────────────────────────────────

def compress_image(raw_bytes: bytes, max_dim: int = 800, quality: int = 75) -> str:
    """
    Compress an image from bytes to a base64 JPEG string.
    - Resizes to max dimension while maintaining aspect ratio
    - Converts to JPEG with specified quality
    """
    img = Image.open(io.BytesIO(raw_bytes))
    img = img.convert("RGB")
    
    # Resize if larger than max_dim
    w, h = img.size
    if max(w, h) > max_dim:
        ratio = max_dim / max(w, h)
        new_size = (int(w * ratio), int(h * ratio))
        img = img.resize(new_size, Image.LANCZOS)
    
    # Compress to JPEG
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=quality, optimize=True)
    buffer.seek(0)
    
    return base64.b64encode(buffer.read()).decode("utf-8")


def serialize(doc: dict) -> dict:
    """Convert MongoDB _id to string and return clean dict."""
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    return doc


# ─── Auth Helper ──────────────────────────────────────────────────────────────

async def get_current_user_from_request(request: Request):
    """Get current user from Authorization header."""
    from server import get_current_user
    return await get_current_user(request)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/products/upload-image")
async def upload_product_image(
    request: Request,
    file: UploadFile = File(...),
    product_name: str = Form(...),
    product_id: Optional[str] = Form(None),
):
    """
    Upload a product image with compression.
    - Accepts JPEG, PNG, WEBP up to 10MB
    - Compresses and stores in MongoDB
    - Creates or updates product record
    """
    # Auth check
    current_user = await get_current_user_from_request(request)
    
    # Validate file type
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}"
        )
    
    # Read and validate size
    raw_bytes = await file.read()
    max_size = 10 * 1024 * 1024  # 10MB
    if len(raw_bytes) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {max_size // (1024*1024)}MB"
        )
    
    # Compress image
    try:
        compressed_b64 = compress_image(raw_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process image: {str(e)}")
    
    # Build data-URI (stored directly in Mongo — no separate file server needed)
    data_uri = f"data:image/jpeg;base64,{compressed_b64}"
    
    # Store in product_images collection
    image_doc = {
        "data": compressed_b64,
        "mime": "image/jpeg",
        "uploaded_by": current_user.get("user_id"),
        "uploaded_at": datetime.now(timezone.utc),
    }
    image_result = await db.product_images.insert_one(image_doc)
    image_id = str(image_result.inserted_id)
    
    # Update or create product
    now = datetime.now(timezone.utc)
    
    if product_id:
        # Update existing product
        await db.products.update_one(
            {"product_id": product_id},
            {"$set": {
                "image_id": image_id,
                "image_url": data_uri,  # Use image_url to be compatible with existing system
                "updated_at": now,
            }}
        )
        product = await db.products.find_one({"product_id": product_id})
    else:
        # Find or create by name
        existing = await db.products.find_one({
            "name": {"$regex": f"^{product_name}$", "$options": "i"}
        })
        
        if existing and not existing.get("image_id"):
            # Update existing product without image
            await db.products.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "image_id": image_id,
                    "image_url": data_uri,  # Use image_url to be compatible with existing system
                    "updated_at": now,
                }}
            )
            product = await db.products.find_one({"_id": existing["_id"]})
        elif existing:
            # Product exists with image - just return it
            product = existing
        else:
            # Create new product
            new_product_id = str(uuid.uuid4())
            new_product = {
                "product_id": new_product_id,
                "name": product_name.strip(),
                "category": "General",
                "image_id": image_id,
                "image_url": data_uri,  # Use image_url to be compatible with existing system
                "created_at": now,
                "updated_at": now,
            }
            await db.products.insert_one(new_product)
            # Fetch the inserted product to get the _id field
            product = await db.products.find_one({"product_id": new_product_id})
    
    return {
        "success": True,
        "product": serialize(product),
        "image_id": image_id,
        "message": "Product image uploaded successfully"
    }


@router.get("/products")
async def list_products(q: Optional[str] = None, limit: int = 50):
    """
    List all products, optionally filtered by search query.
    Returns products with their images.
    """
    query = {}
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    
    products = await db.products.find(query).sort("name", 1).limit(limit).to_list(limit)
    return [serialize(p) for p in products]


# GET endpoint removed - using the existing one in server.py that looks for image_url


@router.patch("/price-reports/{report_id}/attach-image")
async def attach_product_to_report(
    request: Request,
    report_id: str,
    product_id: str = Form(...),
):
    """
    Attach a product (with its image) to an existing price report.
    """
    _ = await get_current_user_from_request(request)  # Auth required
    
    # Find the product
    product = await db.products.find_one({"product_id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Update the price report
    result = await db.price_reports.update_one(
        {"report_id": report_id},
        {"$set": {
            "product_id": product_id,
            "product_image_b64": product.get("image_b64"),
            "product_name": product.get("name"),
            "updated_at": datetime.now(timezone.utc),
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Price report not found")
    
    return {
        "success": True,
        "message": "Product attached to report successfully",
        "product_name": product.get("name")
    }
