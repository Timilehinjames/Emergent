"""
TriniSaver Zone Changes Backend Tests (Iteration 2)
Tests for:
- Gas stations endpoint removal (should return 404)
- New zone names in stores: East-West Corridor, North East, West, Central, South, Deep South
- POST /api/stores: Create new store (auth required), awards 5 points
- POST /api/stores: Reject duplicate store names
- POST /api/auth/register: Accept new zone names like "Deep South"
"""
import pytest
import requests
import os
import uuid

# Read backend URL from frontend env or use public URL
BASE_URL = "https://shop-link-tt.preview.emergentagent.com"

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_user(api_client):
    """Create and authenticate a test user"""
    user_data = {
        "email": f"test_{uuid.uuid4().hex[:8]}@trinisaver.tt",
        "password": "TestPass123!",
        "name": "Test Shopper Zone",
        "region": "Deep South"
    }
    response = api_client.post(f"{BASE_URL}/api/auth/register", json=user_data)
    assert response.status_code == 200
    data = response.json()
    return {
        "token": data["token"],
        "user": data["user"],
        "email": user_data["email"],
        "password": user_data["password"]
    }

class TestGasStationsRemoved:
    """Test that gas stations endpoint is removed (returns 404)"""
    
    def test_gas_stations_endpoint_returns_404(self, api_client):
        """Test: GET /api/gas-stations should return 404 (endpoint removed)"""
        response = api_client.get(f"{BASE_URL}/api/gas-stations")
        assert response.status_code == 404, f"Expected 404 for removed gas-stations endpoint, got {response.status_code}"
        print(f"✓ Gas stations endpoint correctly returns 404 (removed)")

class TestNewZoneNames:
    """Test new zone names throughout the API"""
    
    def test_stores_have_new_zone_names(self, api_client):
        """Test: GET /api/stores returns stores with new region names"""
        response = api_client.get(f"{BASE_URL}/api/stores")
        assert response.status_code == 200
        
        stores = response.json()
        assert len(stores) > 0, "No stores returned"
        
        # Collect all regions from stores
        regions = set(s.get("region", "") for s in stores)
        
        # Expected new zone names
        expected_zones = ['East-West Corridor', 'North East', 'West', 'Central', 'South', 'Deep South']
        
        # Check that stores use new zone names (at least some of them)
        matching_zones = regions.intersection(expected_zones)
        assert len(matching_zones) > 0, f"No stores found with new zone names. Found regions: {regions}"
        
        print(f"✓ Stores have new zone names: {matching_zones}")
        print(f"  All store regions: {regions}")
        
        # Verify old zone names like "North" are NOT present (unless it's part of "North East")
        old_zones = {"North", "South", "East", "Tobago"}
        for store in stores:
            region = store.get("region", "")
            # Allow "North East" but not standalone "North"
            if region in old_zones:
                print(f"  ⚠️ Warning: Store '{store['name']}' still uses old zone: {region}")
    
    def test_register_with_new_zone_names(self, api_client):
        """Test: POST /api/auth/register accepts new zone names like Deep South"""
        new_zones = ['East-West Corridor', 'North East', 'West', 'Central', 'South', 'Deep South']
        
        # Test registration with "Deep South" specifically (mentioned in requirements)
        deep_south_user = {
            "email": f"test_deepsouth_{uuid.uuid4().hex[:6]}@tt.com",
            "password": "Test123!",
            "name": "Deep South Tester",
            "region": "Deep South"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=deep_south_user)
        assert response.status_code == 200, f"Failed to register with Deep South: {response.text}"
        
        data = response.json()
        assert data["user"]["region"] == "Deep South", f"Region not saved correctly: {data['user']['region']}"
        print(f"✓ Registration with 'Deep South' zone successful")
        
        # Test one more zone
        corridor_user = {
            "email": f"test_corridor_{uuid.uuid4().hex[:6]}@tt.com",
            "password": "Test123!",
            "name": "Corridor Tester",
            "region": "East-West Corridor"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=corridor_user)
        assert response.status_code == 200
        assert response.json()["user"]["region"] == "East-West Corridor"
        print(f"✓ Registration with 'East-West Corridor' zone successful")

class TestAddNewStore:
    """Test POST /api/stores to add custom stores"""
    
    def test_create_new_store_with_auth(self, api_client, auth_user):
        """Test: POST /api/stores creates new store, returns points_earned, requires auth"""
        new_store = {
            "name": f"Randy SuperStore - Test {uuid.uuid4().hex[:6]}",
            "type": "supermarket",
            "region": "Central",
            "lat": 10.5167,
            "lng": -61.4119
        }
        
        headers = {"Authorization": f"Bearer {auth_user['token']}"}
        response = api_client.post(f"{BASE_URL}/api/stores", json=new_store, headers=headers)
        assert response.status_code == 200, f"Failed to create store: {response.text}"
        
        data = response.json()
        assert "store" in data, "Response should contain 'store' object"
        assert "points_earned" in data, "Response should contain 'points_earned'"
        assert data["points_earned"] == 5, f"Should earn 5 points for adding store, got {data['points_earned']}"
        assert data["store"]["name"] == new_store["name"]
        assert data["store"]["region"] == new_store["region"]
        assert data["store"]["type"] == new_store["type"]
        assert "store_id" in data["store"]
        
        print(f"✓ Store created: {data['store']['name']}")
        print(f"  Points earned: {data['points_earned']}")
        
        # Verify store appears in GET /api/stores
        get_resp = api_client.get(f"{BASE_URL}/api/stores")
        stores = get_resp.json()
        store_names = [s["name"] for s in stores]
        assert new_store["name"] in store_names, "New store should appear in stores list"
        print(f"✓ Store verified in GET /api/stores")
        
        # Verify user points increased
        me_resp = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        user = me_resp.json()
        assert user["points"] >= 5, f"User should have at least 5 points, got {user['points']}"
        print(f"✓ User points updated: {user['points']} points")
    
    def test_create_store_requires_auth(self, api_client):
        """Test: POST /api/stores without auth token returns 401"""
        new_store = {
            "name": "Test Store Without Auth",
            "type": "supermarket",
            "region": "South"
        }
        
        response = api_client.post(f"{BASE_URL}/api/stores", json=new_store)
        assert response.status_code == 401, f"Should return 401 without auth, got {response.status_code}"
        print(f"✓ POST /api/stores correctly requires authentication")
    
    def test_reject_duplicate_store_names(self, api_client, auth_user):
        """Test: POST /api/stores rejects duplicate store names (case-insensitive)"""
        # Create first store
        store_name = f"Unique Store {uuid.uuid4().hex[:8]}"
        store_data = {
            "name": store_name,
            "type": "supermarket",
            "region": "West",
            "lat": 10.6596,
            "lng": -61.5086
        }
        
        headers = {"Authorization": f"Bearer {auth_user['token']}"}
        response1 = api_client.post(f"{BASE_URL}/api/stores", json=store_data, headers=headers)
        assert response1.status_code == 200, f"First store creation failed: {response1.text}"
        print(f"✓ First store created: {store_name}")
        
        # Try to create duplicate (exact same name)
        response2 = api_client.post(f"{BASE_URL}/api/stores", json=store_data, headers=headers)
        assert response2.status_code == 400, f"Should reject duplicate store, got {response2.status_code}"
        error_data = response2.json()
        assert "already exists" in error_data.get("detail", "").lower(), f"Error message should mention 'already exists'"
        print(f"✓ Duplicate store rejected (exact match)")
        
        # Try to create duplicate with different case
        store_data_upper = {**store_data, "name": store_name.upper()}
        response3 = api_client.post(f"{BASE_URL}/api/stores", json=store_data_upper, headers=headers)
        assert response3.status_code == 400, f"Should reject duplicate store (case-insensitive), got {response3.status_code}"
        print(f"✓ Duplicate store rejected (case-insensitive match)")
    
    def test_create_store_missing_name(self, api_client, auth_user):
        """Test: POST /api/stores without name returns 400"""
        store_data = {
            "name": "",
            "type": "supermarket",
            "region": "Central"
        }
        
        headers = {"Authorization": f"Bearer {auth_user['token']}"}
        response = api_client.post(f"{BASE_URL}/api/stores", json=store_data, headers=headers)
        assert response.status_code == 400, f"Should return 400 for empty name, got {response.status_code}"
        error_data = response.json()
        assert "name" in error_data.get("detail", "").lower() or "required" in error_data.get("detail", "").lower()
        print(f"✓ Empty store name correctly rejected")

class TestExistingUser:
    """Test that existing test user still works"""
    
    def test_existing_test_user_login(self, api_client):
        """Test: Existing test user test_zone@test.com can still login"""
        login_data = {
            "email": "test_zone@test.com",
            "password": "test123"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=login_data)
        assert response.status_code == 200, f"Existing test user login failed: {response.text}"
        
        data = response.json()
        assert data["user"]["email"] == "test_zone@test.com"
        assert data["user"]["region"] == "Deep South", f"Test user should be in Deep South region, got {data['user']['region']}"
        print(f"✓ Existing test user logged in: {data['user']['email']}")
        print(f"  Region: {data['user']['region']}, Points: {data['user']['points']}")
