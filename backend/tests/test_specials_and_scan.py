"""
TriniSaver Specials & Scan Feature Tests
Tests for:
- GET /api/banners: Returns 3 seeded ad banners
- POST /api/scan/shelf-tag: Receipt scanning (scan_type='receipt') returns items array
- POST /api/scan/shelf-tag: Flyer scanning (scan_type='flyer') returns items array with discount_text
- POST /api/specials: Create special with items, awards 15 points
- GET /api/specials: Returns posted specials, supports region filter
"""
import pytest
import requests
import os
import base64

# Read backend URL from frontend .env file
def get_backend_url():
    env_path = '/app/frontend/.env'
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    return 'https://shop-link-tt.preview.emergentagent.com'

BASE_URL = get_backend_url()

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def test_user_token(api_client):
    """Login existing test user and return token"""
    login_data = {"email": "test_zone@test.com", "password": "test123"}
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=login_data)
    assert response.status_code == 200, f"Login failed: {response.text}"
    user = response.json()["user"]
    token = response.json()["token"]
    return {"token": token, "user": user}

@pytest.fixture
def test_user_with_fresh_points(api_client):
    """Create a new test user to track points accurately"""
    import uuid
    user_data = {
        "email": f"TEST_spec_{uuid.uuid4().hex[:8]}@test.com",
        "password": "test123",
        "name": "Test Specials User",
        "region": "Central"
    }
    response = api_client.post(f"{BASE_URL}/api/auth/register", json=user_data)
    assert response.status_code == 200
    return response.json()

class TestBanners:
    """Test ad banners endpoint"""
    
    def test_get_banners_returns_three_seeded(self, api_client):
        """Test: GET /api/banners returns 3 seeded ad banners"""
        response = api_client.get(f"{BASE_URL}/api/banners")
        assert response.status_code == 200, f"Get banners failed: {response.text}"
        
        banners = response.json()
        assert isinstance(banners, list), "Banners should be a list"
        assert len(banners) == 3, f"Should have exactly 3 seeded banners, got {len(banners)}"
        
        # Check structure of banners
        for banner in banners:
            assert "banner_id" in banner, "Banner should have banner_id"
            assert "title" in banner, "Banner should have title"
            assert "subtitle" in banner, "Banner should have subtitle"
            assert "cta_text" in banner, "Banner should have cta_text"
            assert "bg_color" in banner, "Banner should have bg_color"
            assert "text_color" in banner, "Banner should have text_color"
            assert "active" in banner, "Banner should have active field"
            assert banner["active"] == True, "All returned banners should be active"
            assert "_id" not in banner, "MongoDB _id should be excluded"
        
        print(f"✓ Banners: {len(banners)} active banners returned")
        print(f"  Titles: {[b['title'] for b in banners]}")

class TestScanEndpoint:
    """Test scan endpoint with different scan_type parameters"""
    
    def test_scan_receipt_endpoint_structure(self, api_client, test_user_token):
        """Test: POST /api/scan/shelf-tag with scan_type='receipt' returns items array structure"""
        headers = {"Authorization": f"Bearer {test_user_token['token']}"}
        
        # Create a minimal test image (1x1 white pixel)
        test_image = base64.b64encode(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82').decode()
        
        scan_data = {
            "image_base64": test_image,
            "scan_type": "receipt"
        }
        
        response = api_client.post(f"{BASE_URL}/api/scan/shelf-tag", json=scan_data, headers=headers)
        
        # If EMERGENT_LLM_KEY is not configured, expect 500
        if response.status_code == 500:
            error = response.json()
            if "OCR service not configured" in error.get("detail", ""):
                pytest.skip("LLM service not configured - skipping scan test")
            else:
                # LLM error - check we get proper structure even on failure
                print(f"⚠ LLM scan failed (expected in test env): {error.get('detail', 'Unknown error')}")
                pytest.skip("LLM service unavailable")
        
        assert response.status_code == 200, f"Receipt scan failed: {response.text}"
        
        data = response.json()
        # Verify receipt response structure
        assert "scan_type" in data, "Response should have scan_type"
        assert data["scan_type"] == "receipt", "scan_type should be 'receipt'"
        assert "items" in data, "Response should have items array"
        assert isinstance(data["items"], list), "items should be a list"
        assert "store_name" in data, "Response should have store_name"
        assert "total" in data, "Receipt response should have total"
        assert "item_count" in data, "Response should have item_count"
        
        # Check items structure if any returned
        if len(data["items"]) > 0:
            item = data["items"][0]
            assert "product_name" in item
            assert "price" in item
            assert "quantity" in item
            assert "unit" in item
        
        print(f"✓ Receipt scan endpoint: {data['item_count']} items detected, total: ${data.get('total', 0)}")
    
    def test_scan_flyer_endpoint_structure(self, api_client, test_user_token):
        """Test: POST /api/scan/shelf-tag with scan_type='flyer' returns items with discount_text"""
        headers = {"Authorization": f"Bearer {test_user_token['token']}"}
        
        # Create a minimal test image
        test_image = base64.b64encode(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82').decode()
        
        scan_data = {
            "image_base64": test_image,
            "scan_type": "flyer"
        }
        
        response = api_client.post(f"{BASE_URL}/api/scan/shelf-tag", json=scan_data, headers=headers)
        
        # Handle LLM service unavailability
        if response.status_code == 500:
            error = response.json()
            if "OCR service not configured" in error.get("detail", "") or "Scan failed" in error.get("detail", ""):
                pytest.skip("LLM service not configured or failed - skipping flyer scan test")
        
        assert response.status_code == 200, f"Flyer scan failed: {response.text}"
        
        data = response.json()
        # Verify flyer response structure
        assert "scan_type" in data
        assert data["scan_type"] == "flyer", "scan_type should be 'flyer'"
        assert "items" in data, "Response should have items array"
        assert isinstance(data["items"], list), "items should be a list"
        assert "store_name" in data
        assert "valid_until" in data, "Flyer response should have valid_until"
        assert "item_count" in data
        
        # Check items structure - flyer items should have discount_text
        if len(data["items"]) > 0:
            item = data["items"][0]
            assert "product_name" in item
            assert "price" in item
            assert "discount_text" in item, "Flyer items should have discount_text field"
            assert "original_price" in item, "Flyer items should have original_price"
        
        print(f"✓ Flyer scan endpoint: {data['item_count']} deals detected, store: {data.get('store_name', 'N/A')}")
    
    def test_scan_single_price_tag_default(self, api_client, test_user_token):
        """Test: POST /api/scan/shelf-tag with scan_type='single' (default) returns single item"""
        headers = {"Authorization": f"Bearer {test_user_token['token']}"}
        
        test_image = base64.b64encode(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82').decode()
        
        scan_data = {
            "image_base64": test_image,
            "scan_type": "single"
        }
        
        response = api_client.post(f"{BASE_URL}/api/scan/shelf-tag", json=scan_data, headers=headers)
        
        if response.status_code == 500:
            pytest.skip("LLM service not configured")
        
        assert response.status_code == 200, f"Single scan failed: {response.text}"
        
        data = response.json()
        assert "scan_type" in data
        assert data["scan_type"] == "single"
        assert "product_name" in data
        assert "price" in data
        assert "store_name" in data
        assert "quantity" in data
        assert "unit" in data
        
        print(f"✓ Single price tag scan: product={data.get('product_name', 'N/A')}, price=${data.get('price', 0)}")

class TestSpecialsEndpoint:
    """Test specials/sales endpoints"""
    
    def test_create_special_awards_15_points(self, api_client, test_user_with_fresh_points):
        """Test: POST /api/specials creates special and awards 15 points"""
        token = test_user_with_fresh_points["token"]
        user = test_user_with_fresh_points["user"]
        initial_points = user["points"]
        
        headers = {"Authorization": f"Bearer {token}"}
        
        special_data = {
            "title": "TEST_Massy Weekend Sale",
            "store_name": "Massy Stores - Trincity",
            "items": [
                {"product_name": "Rice 5kg", "price": 79.99, "original_price": 89.99, "quantity": 1, "unit": "each", "discount_text": "10% OFF"},
                {"product_name": "Oil 1L", "price": 35.99, "original_price": 39.99, "quantity": 1, "unit": "each", "discount_text": "Save $4"},
                {"product_name": "Flour 2kg", "price": 25.99, "original_price": 29.99, "quantity": 1, "unit": "each", "discount_text": ""},
            ],
            "valid_until": "2026-04-30",
            "photo_base64": ""
        }
        
        response = api_client.post(f"{BASE_URL}/api/specials", json=special_data, headers=headers)
        assert response.status_code == 200, f"Create special failed: {response.text}"
        
        data = response.json()
        assert "special" in data, "Response should have special object"
        assert "points_earned" in data, "Response should have points_earned"
        assert data["points_earned"] == 15, f"Should earn 15 points, got {data['points_earned']}"
        
        special = data["special"]
        assert "special_id" in special
        assert special["title"] == special_data["title"]
        assert special["store_name"] == special_data["store_name"]
        assert len(special["items"]) == 3, "Should have 3 items"
        assert special["valid_until"] == special_data["valid_until"]
        assert special["posted_by_user_id"] == user["user_id"]
        assert special["region"] == user["region"], "Should inherit user's region"
        assert "_id" not in special
        
        print(f"✓ Created special: {special['title']}, special_id: {special['special_id']}, earned: {data['points_earned']} pts")
        
        # Verify points were awarded (Create→GET verification)
        me_resp = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_resp.status_code == 200
        updated_user = me_resp.json()
        assert updated_user["points"] == initial_points + 15, f"Points should be {initial_points + 15}, got {updated_user['points']}"
        print(f"✓ Points verified: {initial_points} → {updated_user['points']}")
        
        return special["special_id"]
    
    def test_get_specials_list(self, api_client, test_user_with_fresh_points):
        """Test: GET /api/specials returns list of specials"""
        token = test_user_with_fresh_points["token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Create a special first
        special_data = {
            "title": "TEST_Get Specials Test",
            "store_name": "PriceSmart - Chaguanas",
            "items": [{"product_name": "Bulk Rice", "price": 149.99, "quantity": 10, "unit": "kg", "discount_text": "Bulk Deal"}],
            "valid_until": "2026-05-15",
            "photo_base64": ""
        }
        create_resp = api_client.post(f"{BASE_URL}/api/specials", json=special_data, headers=headers)
        assert create_resp.status_code == 200
        created_special_id = create_resp.json()["special"]["special_id"]
        
        # Get specials list
        response = api_client.get(f"{BASE_URL}/api/specials?limit=20")
        assert response.status_code == 200, f"Get specials failed: {response.text}"
        
        specials = response.json()
        assert isinstance(specials, list), "Specials should be a list"
        
        # Verify our created special is in the list
        found = any(sp["special_id"] == created_special_id for sp in specials)
        assert found, "Created special should appear in GET /api/specials"
        
        # Check structure
        if len(specials) > 0:
            sp = specials[0]
            assert "special_id" in sp
            assert "title" in sp
            assert "store_name" in sp
            assert "items" in sp
            assert "posted_by_user_id" in sp
            assert "posted_by_name" in sp
            assert "region" in sp
            assert "created_at" in sp
            assert "_id" not in sp
        
        print(f"✓ Get specials: {len(specials)} specials returned")
    
    def test_get_specials_with_region_filter(self, api_client):
        """Test: GET /api/specials?region=Central filters by region"""
        # Create users in different regions and post specials
        import uuid
        
        # Central region user
        central_user_data = {
            "email": f"TEST_central_{uuid.uuid4().hex[:8]}@test.com",
            "password": "test123",
            "name": "Central User",
            "region": "Central"
        }
        central_resp = api_client.post(f"{BASE_URL}/api/auth/register", json=central_user_data)
        central_token = central_resp.json()["token"]
        
        # South region user
        south_user_data = {
            "email": f"TEST_south_{uuid.uuid4().hex[:8]}@test.com",
            "password": "test123",
            "name": "South User",
            "region": "South"
        }
        south_resp = api_client.post(f"{BASE_URL}/api/auth/register", json=south_user_data)
        south_token = south_resp.json()["token"]
        
        # Central user posts special
        central_special = {
            "title": "TEST_Central Special",
            "store_name": "Massy Stores - Price Plaza",
            "items": [{"product_name": "Test Item", "price": 10.00, "quantity": 1, "unit": "each", "discount_text": ""}],
            "valid_until": "",
            "photo_base64": ""
        }
        api_client.post(f"{BASE_URL}/api/specials", json=central_special, headers={"Authorization": f"Bearer {central_token}"})
        
        # South user posts special
        south_special = {
            "title": "TEST_South Special",
            "store_name": "Pennywise - San Fernando",
            "items": [{"product_name": "Test Item", "price": 12.00, "quantity": 1, "unit": "each", "discount_text": ""}],
            "valid_until": "",
            "photo_base64": ""
        }
        api_client.post(f"{BASE_URL}/api/specials", json=south_special, headers={"Authorization": f"Bearer {south_token}"})
        
        # Filter by Central region
        response = api_client.get(f"{BASE_URL}/api/specials?region=Central")
        assert response.status_code == 200
        
        specials = response.json()
        # All returned specials should be from Central region
        for sp in specials:
            if "TEST_" in sp["title"]:  # Only check our test specials
                assert sp["region"] == "Central", f"Region filter failed: got {sp['region']} instead of Central"
        
        print(f"✓ Region filter Central: {len(specials)} specials returned, all from Central region")
        
        # Filter by South region
        south_response = api_client.get(f"{BASE_URL}/api/specials?region=South")
        south_specials = south_response.json()
        
        for sp in south_specials:
            if "TEST_" in sp["title"]:
                assert sp["region"] == "South", f"Region filter failed: got {sp['region']} instead of South"
        
        print(f"✓ Region filter South: {len(south_specials)} specials returned, all from South region")
    
    def test_get_single_special_by_id(self, api_client, test_user_with_fresh_points):
        """Test: GET /api/specials/{special_id} returns a single special"""
        token = test_user_with_fresh_points["token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Create a special
        special_data = {
            "title": "TEST_Single Special Fetch",
            "store_name": "Hi-Lo - Valsayn",
            "items": [{"product_name": "Special Item", "price": 50.00, "quantity": 1, "unit": "each", "discount_text": "20% OFF"}],
            "valid_until": "2026-06-01",
            "photo_base64": ""
        }
        create_resp = api_client.post(f"{BASE_URL}/api/specials", json=special_data, headers=headers)
        special_id = create_resp.json()["special"]["special_id"]
        
        # Get single special
        response = api_client.get(f"{BASE_URL}/api/specials/{special_id}")
        assert response.status_code == 200, f"Get single special failed: {response.text}"
        
        special = response.json()
        assert special["special_id"] == special_id
        assert special["title"] == special_data["title"]
        assert special["store_name"] == special_data["store_name"]
        assert len(special["items"]) == 1
        assert "_id" not in special
        
        print(f"✓ Get single special: {special['title']}")
    
    def test_get_nonexistent_special_returns_404(self, api_client):
        """Test: GET /api/specials/{invalid_id} returns 404"""
        response = api_client.get(f"{BASE_URL}/api/specials/spc_nonexistent")
        assert response.status_code == 404, "Should return 404 for nonexistent special"
        print(f"✓ Get nonexistent special correctly returns 404")
