"""
TriniSaver API Backend Tests
Tests for:
- Auth: Register, Login, GET /me
- Products: List, Search
- Stores: List T&T stores
- Price Reports: Create with points, Recent list
- Compare: Unit price calculation
- Trip Planner: Mocked traffic, evening rush warning
- Leaderboard: Ranked users
- Savings: Summary for auth user
- Profile: Update settings
- Gas Stations: Mocked data
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def test_user_data():
    """Test user credentials"""
    import uuid
    return {
        "email": f"test_{uuid.uuid4().hex[:8]}@trinisaver.tt",
        "password": "TestPass123!",
        "name": "Test Shopper",
        "region": "North"
    }

class TestAuth:
    """Authentication endpoint tests"""
    
    def test_register_new_user(self, api_client, test_user_data):
        """Test: Register a new user with email/password and verify JWT token returned"""
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=test_user_data)
        assert response.status_code == 200, f"Register failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "JWT token not returned"
        assert "user" in data, "User object not returned"
        assert data["user"]["email"] == test_user_data["email"]
        assert data["user"]["name"] == test_user_data["name"]
        assert data["user"]["region"] == test_user_data["region"]
        assert data["user"]["points"] == 0
        assert "user_id" in data["user"]
        print(f"✓ Registered user: {data['user']['email']}, token: {data['token'][:20]}...")
        return data
    
    def test_login_existing_user(self, api_client, test_user_data):
        """Test: Login with registered user credentials"""
        # First register
        reg_resp = api_client.post(f"{BASE_URL}/api/auth/register", json=test_user_data)
        assert reg_resp.status_code == 200
        
        # Then login
        login_data = {"email": test_user_data["email"], "password": test_user_data["password"]}
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=login_data)
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "JWT token not returned on login"
        assert "user" in data, "User object not returned on login"
        assert data["user"]["email"] == test_user_data["email"]
        print(f"✓ Login successful for: {data['user']['email']}")
        return data
    
    def test_get_auth_me(self, api_client, test_user_data):
        """Test: GET /api/auth/me returns user profile when authenticated"""
        # Register and get token
        reg_resp = api_client.post(f"{BASE_URL}/api/auth/register", json=test_user_data)
        token = reg_resp.json()["token"]
        
        # Call /me with token
        headers = {"Authorization": f"Bearer {token}"}
        response = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200, f"/me failed: {response.text}"
        
        data = response.json()
        assert data["email"] == test_user_data["email"]
        assert "user_id" in data
        assert "password_hash" not in data, "Password hash exposed in response"
        print(f"✓ GET /me successful: {data['email']}, points: {data.get('points', 0)}")

class TestProductsAndStores:
    """Products and Stores endpoints"""
    
    def test_get_products_list(self, api_client):
        """Test: GET /api/products returns seeded product list"""
        response = api_client.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200, f"Products list failed: {response.text}"
        
        products = response.json()
        assert isinstance(products, list), "Products should be a list"
        assert len(products) > 0, "No products returned"
        
        # Check structure of first product
        p = products[0]
        assert "product_id" in p
        assert "name" in p
        assert "category" in p
        assert "_id" not in p, "MongoDB _id should be excluded"
        print(f"✓ Products list returned: {len(products)} products")
    
    def test_search_products_by_name(self, api_client):
        """Test: GET /api/products?search=rice returns filtered results"""
        response = api_client.get(f"{BASE_URL}/api/products?search=rice")
        assert response.status_code == 200, f"Products search failed: {response.text}"
        
        products = response.json()
        assert isinstance(products, list)
        # Should find rice products
        if len(products) > 0:
            product_names = [p["name"].lower() for p in products]
            assert any("rice" in name for name in product_names), "Search for 'rice' returned no rice products"
            print(f"✓ Products search 'rice': {len(products)} results")
        else:
            print("⚠ Products search 'rice': no results (may need more seed data)")
    
    def test_get_stores_list(self, api_client):
        """Test: GET /api/stores returns T&T store list"""
        response = api_client.get(f"{BASE_URL}/api/stores")
        assert response.status_code == 200, f"Stores list failed: {response.text}"
        
        stores = response.json()
        assert isinstance(stores, list), "Stores should be a list"
        assert len(stores) > 0, "No stores returned"
        
        # Check for Trinidad stores
        store_names = [s["name"] for s in stores]
        assert any("Massy" in name or "PriceSmart" in name or "Pennywise" in name for name in store_names), \
            "Should include T&T stores like Massy, PriceSmart, Pennywise"
        
        # Check structure
        s = stores[0]
        assert "store_id" in s
        assert "name" in s
        assert "region" in s
        assert "_id" not in s
        print(f"✓ Stores list returned: {len(stores)} stores")

class TestPriceReports:
    """Price reporting endpoints"""
    
    def test_create_price_report_with_points(self, api_client, test_user_data):
        """Test: POST /api/price-reports creates a report and awards points (auth required)"""
        # Register user
        reg_resp = api_client.post(f"{BASE_URL}/api/auth/register", json=test_user_data)
        token = reg_resp.json()["token"]
        user_id = reg_resp.json()["user"]["user_id"]
        
        # Create price report
        report_data = {
            "product_name": "Test Rice 5kg",
            "store_name": "Massy Stores - Trincity",
            "price": 89.99,
            "quantity": 5.0,
            "unit": "kg",
            "photo_base64": ""
        }
        headers = {"Authorization": f"Bearer {token}"}
        response = api_client.post(f"{BASE_URL}/api/price-reports", json=report_data, headers=headers)
        assert response.status_code == 200, f"Price report creation failed: {response.text}"
        
        data = response.json()
        assert "report" in data
        assert "points_earned" in data
        assert data["points_earned"] == 5, "Should earn 5 points for report without photo"
        assert data["report"]["product_name"] == report_data["product_name"]
        assert data["report"]["store_name"] == report_data["store_name"]
        assert data["report"]["price"] == report_data["price"]
        assert data["report"]["unit_price"] > 0, "Unit price should be calculated"
        print(f"✓ Price report created, earned: {data['points_earned']} points")
        
        # Verify points were awarded
        me_resp = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        user = me_resp.json()
        assert user["points"] == 5, f"User should have 5 points, got {user['points']}"
        print(f"✓ User points updated: {user['points']}")
    
    def test_get_recent_price_reports(self, api_client):
        """Test: GET /api/price-reports/recent returns recent reports"""
        response = api_client.get(f"{BASE_URL}/api/price-reports/recent?limit=5")
        assert response.status_code == 200, f"Recent reports failed: {response.text}"
        
        reports = response.json()
        assert isinstance(reports, list)
        # Should have seeded reports
        assert len(reports) > 0, "Should have recent reports (seeded data)"
        
        r = reports[0]
        assert "product_name" in r
        assert "store_name" in r
        assert "price" in r
        assert "unit_price" in r
        assert "_id" not in r
        assert "photo_base64" not in r, "Photo data should be excluded from recent list"
        print(f"✓ Recent reports: {len(reports)} reports")

class TestUnitPriceComparison:
    """Unit price comparison endpoint"""
    
    def test_compare_unit_prices(self, api_client):
        """Test: POST /api/compare/unit-price calculates and compares unit prices correctly"""
        compare_data = {
            "items": [
                {"product_name": "Rice 5kg", "store_name": "Massy Stores", "price": 89.99, "quantity": 5, "unit": "kg"},
                {"product_name": "Rice 2kg", "store_name": "Hi-Lo", "price": 42.99, "quantity": 2, "unit": "kg"},
                {"product_name": "Rice 5kg Bulk", "store_name": "PriceSmart", "price": 79.99, "quantity": 5, "unit": "kg"},
            ]
        }
        response = api_client.post(f"{BASE_URL}/api/compare/unit-price", json=compare_data)
        assert response.status_code == 200, f"Unit price compare failed: {response.text}"
        
        data = response.json()
        assert "results" in data
        assert "cheapest" in data
        assert "potential_savings_per_unit" in data
        
        # Verify results are sorted by unit price (ascending)
        results = data["results"]
        assert len(results) == 3
        unit_prices = [r["unit_price"] for r in results]
        assert unit_prices == sorted(unit_prices), "Results should be sorted by unit price"
        
        # Verify cheapest is correct
        assert data["cheapest"]["store_name"] == results[0]["store_name"]
        assert data["cheapest"]["unit_price"] == results[0]["unit_price"]
        
        # Verify unit price calculation (PriceSmart: 79.99 TTD for 5kg = 79.99/(5*10) = 1.60 per 100g)
        # Backend normalizes kg to 100g base unit for fair comparison
        pricesmart = [r for r in results if "PriceSmart" in r["store_name"]][0]
        # For 5kg at $79.99: base_quantity = 5 * 10 = 50 (hundred grams), unit_price = 79.99/50 = 1.5998 ≈ 1.6
        expected_unit_price = 1.6
        assert pricesmart["unit_price"] == expected_unit_price, \
            f"Unit price calculation wrong: expected {expected_unit_price}, got {pricesmart['unit_price']}"
        assert pricesmart["per_unit"] == "100g", "Should normalize to 100g for weight items"
        
        print(f"✓ Unit price compare: cheapest is {data['cheapest']['store_name']} at ${data['cheapest']['unit_price']}/100g")
        print(f"  Potential savings: ${data['potential_savings_per_unit']}")

class TestTripPlanner:
    """Trip planner with mocked traffic data"""
    
    def test_plan_trip_with_mocked_traffic(self, api_client):
        """Test: POST /api/trip/plan returns mocked traffic data and suggestions"""
        trip_data = {
            "stores": ["Massy Stores - Trincity", "PriceSmart - Chaguanas"],
            "time_of_day": "midday"
        }
        response = api_client.post(f"{BASE_URL}/api/trip/plan", json=trip_data)
        assert response.status_code == 200, f"Trip plan failed: {response.text}"
        
        data = response.json()
        assert "legs" in data
        assert "total_distance_km" in data
        assert "total_time_min" in data
        assert "traffic_condition" in data
        assert "is_peak" in data
        assert "is_worth_it" in data
        assert "suggestion" in data
        
        # Midday should not be peak
        assert data["is_peak"] == False, "Midday should not be peak traffic"
        assert data["traffic_condition"] == "Light"
        print(f"✓ Trip plan midday: {data['total_distance_km']}km, {data['total_time_min']}min, {data['traffic_condition']} traffic")
    
    def test_evening_rush_warning(self, api_client):
        """Test: Evening rush should warn user it's not worth the trip"""
        trip_data = {
            "stores": ["Massy Stores - Trincity", "PriceSmart - Chaguanas", "Hi-Lo - Maraval"],
            "time_of_day": "evening_rush"
        }
        response = api_client.post(f"{BASE_URL}/api/trip/plan", json=trip_data)
        assert response.status_code == 200, f"Trip plan evening rush failed: {response.text}"
        
        data = response.json()
        assert data["is_peak"] == True, "Evening rush should be peak traffic"
        assert data["traffic_condition"] == "Heavy"
        assert data["is_worth_it"] == False, "Multi-store trip during evening rush should not be worth it"
        assert "Traffic is Heavy" in data["suggestion"] or "not worth" in data["suggestion"].lower(), \
            "Should warn about heavy traffic"
        print(f"✓ Evening rush warning: {data['suggestion']}")

class TestCommunity:
    """Leaderboard and community endpoints"""
    
    def test_get_leaderboard_all_regions(self, api_client):
        """Test: GET /api/leaderboard returns ranked users"""
        response = api_client.get(f"{BASE_URL}/api/leaderboard")
        assert response.status_code == 200, f"Leaderboard failed: {response.text}"
        
        leaderboard = response.json()
        assert isinstance(leaderboard, list)
        
        if len(leaderboard) > 0:
            # Verify structure
            entry = leaderboard[0]
            assert "rank" in entry
            assert "user_id" in entry
            assert "name" in entry
            assert "region" in entry
            assert "points" in entry
            assert "password_hash" not in entry
            
            # Verify sorted by points descending
            if len(leaderboard) > 1:
                for i in range(len(leaderboard) - 1):
                    assert leaderboard[i]["points"] >= leaderboard[i+1]["points"], "Leaderboard should be sorted by points desc"
                    assert leaderboard[i]["rank"] == i + 1, "Rank should be sequential"
            
            print(f"✓ Leaderboard: {len(leaderboard)} users, top: {leaderboard[0]['name']} with {leaderboard[0]['points']} pts")
        else:
            print("⚠ Leaderboard: no users yet")
    
    def test_leaderboard_region_filter(self, api_client):
        """Test leaderboard with region filter"""
        response = api_client.get(f"{BASE_URL}/api/leaderboard?region=North")
        assert response.status_code == 200
        
        leaderboard = response.json()
        # All users should be from North region
        if len(leaderboard) > 0:
            for entry in leaderboard:
                assert entry["region"] == "North", f"Region filter failed: got {entry['region']}"
            print(f"✓ Leaderboard North region: {len(leaderboard)} users")

class TestSavingsAndProfile:
    """Savings summary and profile endpoints"""
    
    def test_get_savings_summary(self, api_client, test_user_data):
        """Test: GET /api/savings-summary returns savings for authenticated user"""
        # Register user
        reg_resp = api_client.post(f"{BASE_URL}/api/auth/register", json=test_user_data)
        token = reg_resp.json()["token"]
        
        # Get savings summary
        headers = {"Authorization": f"Bearer {token}"}
        response = api_client.get(f"{BASE_URL}/api/savings-summary", headers=headers)
        assert response.status_code == 200, f"Savings summary failed: {response.text}"
        
        data = response.json()
        assert "total_reports" in data
        assert "estimated_savings_ttd" in data
        assert "points" in data
        assert "this_month_reports" in data
        assert "this_month_savings" in data
        
        # New user should have 0 reports
        assert data["total_reports"] == 0
        assert data["estimated_savings_ttd"] == 0
        assert data["points"] == 0
        print(f"✓ Savings summary: {data['total_reports']} reports, ${data['estimated_savings_ttd']} saved")
    
    def test_update_profile_settings(self, api_client, test_user_data):
        """Test: PUT /api/profile updates user settings like region and PriceSmart member toggle"""
        # Register user
        reg_resp = api_client.post(f"{BASE_URL}/api/auth/register", json=test_user_data)
        token = reg_resp.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Update region
        update_data = {"region": "South", "is_pricesmart_member": True}
        response = api_client.put(f"{BASE_URL}/api/profile", json=update_data, headers=headers)
        assert response.status_code == 200, f"Profile update failed: {response.text}"
        
        updated = response.json()
        assert updated["region"] == "South", "Region should be updated to South"
        assert updated["is_pricesmart_member"] == True, "PriceSmart member should be True"
        print(f"✓ Profile updated: region={updated['region']}, pricesmart={updated['is_pricesmart_member']}")
        
        # Verify persistence with GET
        get_resp = api_client.get(f"{BASE_URL}/api/profile", headers=headers)
        assert get_resp.status_code == 200
        profile = get_resp.json()
        assert profile["region"] == "South"
        assert profile["is_pricesmart_member"] == True
        print(f"✓ Profile changes persisted")

class TestGasStations:
    """Gas stations endpoint"""
    
    def test_get_gas_stations_mocked(self, api_client):
        """Test: GET /api/gas-stations returns mocked gas station data"""
        response = api_client.get(f"{BASE_URL}/api/gas-stations")
        assert response.status_code == 200, f"Gas stations failed: {response.text}"
        
        stations = response.json()
        assert isinstance(stations, list)
        assert len(stations) > 0, "Should have seeded gas stations"
        
        station = stations[0]
        assert "station_id" in station
        assert "name" in station
        assert "brand" in station
        assert "price_per_litre" in station
        assert "region" in station
        assert "_id" not in station
        
        # Check for T&T gas brands
        brands = [s["brand"] for s in stations]
        assert any(brand in ["NP", "Unipet"] for brand in brands), "Should include T&T gas brands"
        print(f"✓ Gas stations: {len(stations)} stations, brands: {set(brands)}")
