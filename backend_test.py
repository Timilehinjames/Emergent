#!/usr/bin/env python3
"""
TriniSaver Backend API Testing Suite
Tests all admin panel endpoints and flag functionality
"""

import asyncio
import aiohttp
import json
import sys
from typing import Dict, Any, Optional

# Backend URL from frontend environment
BACKEND_URL = "https://shop-link-tt.preview.emergentagent.com/api"

class TriniSaverTestClient:
    def __init__(self):
        self.session = None
        self.admin_token = None
        self.regular_token = None
        self.admin_user = None
        self.regular_user = None
        
    async def setup_session(self):
        self.session = aiohttp.ClientSession()
        
    async def cleanup(self):
        if self.session:
            await self.session.close()
            
    async def register_user(self, email: str, password: str, name: str) -> Dict[str, Any]:
        """Register a new user"""
        payload = {
            "email": email,
            "password": password,
            "name": name,
            "region": "East-West Corridor"
        }
        
        async with self.session.post(f"{BACKEND_URL}/auth/register", json=payload) as resp:
            if resp.status == 200:
                data = await resp.json()
                return {"success": True, "data": data}
            else:
                text = await resp.text()
                return {"success": False, "error": f"Status {resp.status}: {text}"}
                
    async def login_user(self, email: str, password: str) -> Dict[str, Any]:
        """Login user and return token"""
        payload = {"email": email, "password": password}
        
        async with self.session.post(f"{BACKEND_URL}/auth/login", json=payload) as resp:
            if resp.status == 200:
                data = await resp.json()
                return {"success": True, "data": data}
            else:
                text = await resp.text()
                return {"success": False, "error": f"Status {resp.status}: {text}"}
                
    async def create_price_report(self, token: str, product_name: str, store_name: str, price: float) -> Dict[str, Any]:
        """Create a price report for testing"""
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "product_name": product_name,
            "store_name": store_name,
            "price": price,
            "quantity": 1.0,
            "unit": "each"
        }
        
        async with self.session.post(f"{BACKEND_URL}/price-reports", json=payload, headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                return {"success": True, "data": data}
            else:
                text = await resp.text()
                return {"success": False, "error": f"Status {resp.status}: {text}"}
                
    async def create_special(self, token: str, store_name: str, title: str = "Test Special") -> Dict[str, Any]:
        """Create a special for testing"""
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "store_name": store_name,
            "title": title,
            "items": [{"product_name": "Test Product", "price": 19.99}],
            "valid_until": "2024-12-31"
        }
        
        async with self.session.post(f"{BACKEND_URL}/specials", json=payload, headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                return {"success": True, "data": data}
            else:
                text = await resp.text()
                return {"success": False, "error": f"Status {resp.status}: {text}"}
                
    async def make_api_call(self, method: str, endpoint: str, token: Optional[str] = None, 
                           payload: Optional[Dict] = None) -> Dict[str, Any]:
        """Make a generic API call"""
        url = f"{BACKEND_URL}{endpoint}"
        headers = {}
        
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
        try:
            async with self.session.request(method, url, json=payload, headers=headers) as resp:
                text = await resp.text()
                try:
                    data = json.loads(text) if text else {}
                except json.JSONDecodeError:
                    data = {"raw_response": text}
                    
                return {
                    "status": resp.status,
                    "success": resp.status < 400,
                    "data": data
                }
        except Exception as e:
            return {"status": 0, "success": False, "error": str(e)}

async def main():
    print("🧪 TriniSaver Backend API Testing Suite")
    print("=" * 50)
    
    client = TriniSaverTestClient()
    await client.setup_session()
    
    test_results = {
        "total_tests": 0,
        "passed": 0,
        "failed": 0,
        "errors": []
    }
    
    def log_test(name: str, success: bool, details: str = ""):
        test_results["total_tests"] += 1
        if success:
            test_results["passed"] += 1
            print(f"✅ {name}")
        else:
            test_results["failed"] += 1
            test_results["errors"].append(f"{name}: {details}")
            print(f"❌ {name}: {details}")
            
    try:
        # Step 1: Setup test users
        print("\n🔧 Setting up test users...")
        
        # Register admin user
        admin_reg = await client.register_user("admin@test.com", "test123", "Test Admin")
        if admin_reg["success"]:
            client.admin_token = admin_reg["data"]["token"]
            client.admin_user = admin_reg["data"]["user"]
            log_test("Admin user registration", True)
        else:
            # Try to login in case user already exists
            admin_login = await client.login_user("admin@test.com", "test123")
            if admin_login["success"]:
                client.admin_token = admin_login["data"]["token"]
                client.admin_user = admin_login["data"]["user"]
                log_test("Admin user login", True)
            else:
                log_test("Admin user setup", False, admin_login["error"])
                return
                
        # Register regular user for comparison tests
        regular_reg = await client.register_user("regular@test.com", "test123", "Regular User")
        if regular_reg["success"]:
            client.regular_token = regular_reg["data"]["token"]
            client.regular_user = regular_reg["data"]["user"]
            log_test("Regular user registration", True)
        else:
            # Try to login in case user already exists
            regular_login = await client.login_user("regular@test.com", "test123")
            if regular_login["success"]:
                client.regular_token = regular_login["data"]["token"]
                client.regular_user = regular_login["data"]["user"]
                log_test("Regular user login", True)
            else:
                log_test("Regular user setup", False, regular_login["error"])
                
        # Step 2: Test Admin Check API
        print("\n🔐 Testing Admin Check API...")
        
        admin_check = await client.make_api_call("GET", "/admin/check", client.admin_token)
        if admin_check["success"] and admin_check["data"].get("is_admin") is True:
            log_test("Admin check with admin user", True)
        else:
            log_test("Admin check with admin user", False, f"Expected is_admin=True, got {admin_check}")
            
        if client.regular_token:
            regular_check = await client.make_api_call("GET", "/admin/check", client.regular_token)
            if regular_check["success"] and regular_check["data"].get("is_admin") is False:
                log_test("Admin check with regular user", True)
            else:
                log_test("Admin check with regular user", False, f"Expected is_admin=False, got {regular_check}")
                
        # Step 3: Test Admin Stats API
        print("\n📊 Testing Admin Stats API...")
        
        stats = await client.make_api_call("GET", "/admin/stats", client.admin_token)
        if stats["success"]:
            required_fields = ["total_users", "total_reports", "flagged_reports", "total_stores"]
            missing_fields = [f for f in required_fields if f not in stats["data"]]
            if not missing_fields:
                log_test("Admin stats API", True)
            else:
                log_test("Admin stats API", False, f"Missing fields: {missing_fields}")
        else:
            log_test("Admin stats API", False, f"Status {stats['status']}: {stats.get('data', {})}")
            
        # Test stats with non-admin user
        if client.regular_token:
            stats_regular = await client.make_api_call("GET", "/admin/stats", client.regular_token)
            if stats_regular["status"] == 403:
                log_test("Admin stats API access control", True)
            else:
                log_test("Admin stats API access control", False, f"Expected 403, got {stats_regular['status']}")
                
        # Step 4: Test Admin Users API
        print("\n👥 Testing Admin Users API...")
        
        users = await client.make_api_call("GET", "/admin/users", client.admin_token)
        if users["success"] and "users" in users["data"]:
            log_test("Admin users listing", True)
            
            # Test search functionality
            users_search = await client.make_api_call("GET", "/admin/users?search=admin", client.admin_token)
            if users_search["success"]:
                log_test("Admin users search", True)
            else:
                log_test("Admin users search", False, f"Search failed: {users_search}")
        else:
            log_test("Admin users listing", False, f"Failed: {users}")
            
        # Step 5: Create test data for flagging tests
        print("\n📝 Creating test data...")
        
        # Create a price report with unique data
        import time
        unique_suffix = str(int(time.time()))
        report = await client.create_price_report(client.admin_token, f"Test Rice {unique_suffix}", "Test Store", 89.99)
        report_id = None
        if report["success"]:
            report_id = report["data"]["report"]["report_id"]
            log_test("Create test price report", True)
        else:
            log_test("Create test price report", False, report["error"])
            
        # Create a special with unique data
        special = await client.create_special(client.admin_token, "Test Store", f"Test Special Deal {unique_suffix}")
        special_id = None
        if special["success"]:
            special_id = special["data"]["special"]["special_id"]
            log_test("Create test special", True)
        else:
            log_test("Create test special", False, special["error"])
            
        # Step 6: Test Flag as Outdated API
        print("\n🚩 Testing Flag as Outdated API...")
        
        if report_id and client.regular_token:
            # Flag the report as outdated
            flag_result = await client.make_api_call("POST", f"/flag/report/{report_id}", client.regular_token)
            if flag_result["success"]:
                flag_count = flag_result["data"].get("flag_count", 0)
                is_outdated = flag_result["data"].get("is_outdated", False)
                if flag_count == 1 and not is_outdated:
                    log_test("Flag report as outdated (first flag)", True)
                else:
                    log_test("Flag report as outdated", False, f"Expected flag_count=1, is_outdated=False, got {flag_result['data']}")
            else:
                log_test("Flag report as outdated", False, f"Failed: {flag_result}")
                
            # Try to flag again with same user (should fail)
            flag_again = await client.make_api_call("POST", f"/flag/report/{report_id}", client.regular_token)
            if flag_again["status"] == 409:  # Conflict - already flagged
                log_test("Prevent duplicate flagging", True)
            else:
                log_test("Prevent duplicate flagging", False, f"Expected 409, got {flag_again}")
        
        if special_id and client.admin_token:
            # Flag the special as outdated
            flag_special = await client.make_api_call("POST", f"/flag/special/{special_id}", client.admin_token)
            if flag_special["success"]:
                log_test("Flag special as outdated", True)
            else:
                log_test("Flag special as outdated", False, f"Failed: {flag_special}")
                
        # Test invalid item type
        flag_invalid = await client.make_api_call("POST", f"/flag/invalid/test123", client.admin_token)
        if flag_invalid["status"] == 400:
            log_test("Flag invalid item type validation", True)
        else:
            log_test("Flag invalid item type validation", False, f"Expected 400, got {flag_invalid}")
            
        # Step 7: Test Admin Flagged Items API
        print("\n🔍 Testing Admin Flagged Items API...")
        
        flagged = await client.make_api_call("GET", "/admin/flagged", client.admin_token)
        if flagged["success"] and "reports" in flagged["data"] and "specials" in flagged["data"]:
            log_test("Admin flagged items listing", True)
            
            # Test filtering by type
            flagged_reports = await client.make_api_call("GET", "/admin/flagged?item_type=reports", client.admin_token)
            if flagged_reports["success"]:
                log_test("Admin flagged items filtering", True)
            else:
                log_test("Admin flagged items filtering", False, f"Failed: {flagged_reports}")
        else:
            log_test("Admin flagged items listing", False, f"Failed: {flagged}")
            
        # Step 8: Test Admin Stores API
        print("\n🏪 Testing Admin Stores API...")
        
        stores = await client.make_api_call("GET", "/admin/stores", client.admin_token)
        if stores["success"] and isinstance(stores["data"], list):
            log_test("Admin stores listing", True)
            
            # Test updating store status if there are stores
            if stores["data"]:
                store_id = stores["data"][0].get("store_id")
                if store_id:
                    update_store = await client.make_api_call("PUT", f"/admin/stores/{store_id}", 
                                                            client.admin_token, {"status": "approved"})
                    if update_store["success"]:
                        log_test("Admin store update", True)
                    else:
                        log_test("Admin store update", False, f"Failed: {update_store}")
        else:
            log_test("Admin stores listing", False, f"Failed: {stores}")
            
        # Step 9: Test Admin Banners API
        print("\n📢 Testing Admin Banners API...")
        
        # List banners
        banners = await client.make_api_call("GET", "/admin/banners", client.admin_token)
        if banners["success"] and isinstance(banners["data"], list):
            log_test("Admin banners listing", True)
        else:
            log_test("Admin banners listing", False, f"Failed: {banners}")
            
        # Create a new banner
        new_banner_data = {
            "title": "Test Banner",
            "subtitle": "Test banner for API testing",
            "cta_text": "Click Here",
            "cta_url": "https://example.com",
            "bg_color": "#FF5722",
            "text_color": "#FFFFFF",
            "active": True,
            "priority": 5
        }
        
        create_banner = await client.make_api_call("POST", "/admin/banners", 
                                                 client.admin_token, new_banner_data)
        if create_banner["success"]:
            banner_id = create_banner["data"].get("banner_id")
            log_test("Admin create banner", True)
            
            # Update the banner
            if banner_id:
                update_banner = await client.make_api_call("PUT", f"/admin/banners/{banner_id}",
                                                         client.admin_token, {"title": "Updated Test Banner"})
                if update_banner["success"]:
                    log_test("Admin update banner", True)
                else:
                    log_test("Admin update banner", False, f"Failed: {update_banner}")
                    
                # Delete the banner
                delete_banner = await client.make_api_call("DELETE", f"/admin/banners/{banner_id}",
                                                         client.admin_token)
                if delete_banner["success"]:
                    log_test("Admin delete banner", True)
                else:
                    log_test("Admin delete banner", False, f"Failed: {delete_banner}")
        else:
            log_test("Admin create banner", False, f"Failed: {create_banner}")
            
        # Step 10: Test Smart Split API
        print("\n🧠 Testing Smart Split API...")
        
        # Test data from review request
        smart_split_data = {
            "items": [
                {"name": "Rice", "category": "Grains & Rice", "quantity": 2},
                {"name": "Cooking Oil", "category": "Cooking Oil", "quantity": 1},
                {"name": "Shampoo", "category": "Toiletries", "quantity": 1, "tags": ["toiletry"]},
                {"name": "Chicken", "category": "Meat & Poultry", "quantity": 2},
                {"name": "Milk", "category": "Dairy", "quantity": 3}
            ],
            "region": "East-West Corridor",
            "is_pricesmart_member": True,
            "prefer_single_store": False
        }
        
        smart_split = await client.make_api_call("POST", "/smart-split", client.admin_token, smart_split_data)
        if smart_split["success"] and "splits" in smart_split["data"]:
            splits = smart_split["data"]["splits"]
            if splits and isinstance(splits, list) and len(splits) > 0:
                # Check if splits have required structure
                first_split = splits[0]
                required_split_fields = ["store", "items", "item_count"]
                if all(field in first_split for field in required_split_fields):
                    log_test("Smart Split API", True)
                else:
                    log_test("Smart Split API", False, f"Missing required fields in splits: {first_split}")
            else:
                log_test("Smart Split API", False, f"No splits returned or invalid format: {smart_split['data']}")
        else:
            log_test("Smart Split API", False, f"Failed: {smart_split}")
            
        # Test Smart Split without authentication
        smart_split_no_auth = await client.make_api_call("POST", "/smart-split", None, smart_split_data)
        if smart_split_no_auth["status"] == 401:
            log_test("Smart Split API auth required", True)
        else:
            log_test("Smart Split API auth required", False, f"Expected 401, got {smart_split_no_auth['status']}")
            
        # Step 11: Test Traffic Status API
        print("\n🚦 Testing Traffic Status API...")
        
        traffic_status = await client.make_api_call("GET", "/traffic-status", client.admin_token)
        if traffic_status["success"]:
            traffic_data = traffic_status["data"]
            expected_fields = ["region", "is_peak_hours", "current_delay_mins"]
            if all(field in traffic_data for field in expected_fields):
                log_test("Traffic Status API", True)
            else:
                log_test("Traffic Status API", False, f"Missing fields in traffic data: {traffic_data}")
        else:
            log_test("Traffic Status API", False, f"Failed: {traffic_status}")
            
        # Test Traffic Status without authentication
        traffic_no_auth = await client.make_api_call("GET", "/traffic-status")
        if traffic_no_auth["status"] == 401:
            log_test("Traffic Status API auth required", True)
        else:
            log_test("Traffic Status API auth required", False, f"Expected 401, got {traffic_no_auth['status']}")
            
        # Step 12: Test Admin Products API (CRUD)
        print("\n📦 Testing Admin Products API...")
        
        # GET /admin/products - List all products
        products_list = await client.make_api_call("GET", "/admin/products", client.admin_token)
        if products_list["success"] and isinstance(products_list["data"], list):
            log_test("Admin Products - List", True)
        else:
            log_test("Admin Products - List", False, f"Failed: {products_list}")
            
        # POST /admin/products - Create new product
        new_product_data = {
            "name": "Starlite Rice",
            "category": "Grains & Rice",
            "brand": "Starlite",
            "unit_type": "kg",
            "tags": ["staples"]
        }
        
        create_product = await client.make_api_call("POST", "/admin/products", client.admin_token, new_product_data)
        product_id = None
        if create_product["success"] and "product_id" in create_product["data"]:
            product_id = create_product["data"]["product_id"]
            log_test("Admin Products - Create", True)
        else:
            log_test("Admin Products - Create", False, f"Failed: {create_product}")
            
        # PUT /admin/products/{product_id} - Update product
        if product_id:
            update_data = {"category": "Rice & Grains"}
            update_product = await client.make_api_call("PUT", f"/admin/products/{product_id}", 
                                                      client.admin_token, update_data)
            if update_product["success"]:
                log_test("Admin Products - Update", True)
            else:
                log_test("Admin Products - Update", False, f"Failed: {update_product}")
                
            # DELETE /admin/products/{product_id} - Delete product
            delete_product = await client.make_api_call("DELETE", f"/admin/products/{product_id}", client.admin_token)
            if delete_product["success"]:
                log_test("Admin Products - Delete", True)
            else:
                log_test("Admin Products - Delete", False, f"Failed: {delete_product}")
        
        # Test admin authentication enforcement on Products API
        if client.regular_token:
            # Test non-admin access to admin products endpoints
            regular_products = await client.make_api_call("GET", "/admin/products", client.regular_token)
            if regular_products["status"] == 403:
                log_test("Admin Products API access control", True)
            else:
                log_test("Admin Products API access control", False, f"Expected 403, got {regular_products['status']}")
                
            # Test creating product as non-admin
            regular_create = await client.make_api_call("POST", "/admin/products", client.regular_token, new_product_data)
            if regular_create["status"] == 403:
                log_test("Admin Products Create - non-admin blocked", True)
            else:
                log_test("Admin Products Create - non-admin blocked", False, f"Expected 403, got {regular_create['status']}")
                
        # Step 13: Test authentication on all admin endpoints
        print("\n🔒 Testing authentication on admin endpoints...")
        
        # Test without token
        no_auth = await client.make_api_call("GET", "/admin/stats")
        if no_auth["status"] == 401:
            log_test("Admin endpoint without auth", True)
        else:
            log_test("Admin endpoint without auth", False, f"Expected 401, got {no_auth['status']}")
            
        # Test with regular user token on admin endpoint
        if client.regular_token:
            regular_admin = await client.make_api_call("GET", "/admin/stats", client.regular_token)
            if regular_admin["status"] == 403:
                log_test("Admin endpoint with non-admin user", True)
            else:
                log_test("Admin endpoint with non-admin user", False, f"Expected 403, got {regular_admin['status']}")
                
    except Exception as e:
        print(f"💥 Test suite error: {str(e)}")
        test_results["errors"].append(f"Test suite error: {str(e)}")
        
    finally:
        await client.cleanup()
        
    # Print final results
    print("\n" + "=" * 50)
    print("📋 TEST RESULTS SUMMARY")
    print("=" * 50)
    print(f"Total Tests: {test_results['total_tests']}")
    print(f"✅ Passed: {test_results['passed']}")
    print(f"❌ Failed: {test_results['failed']}")
    
    if test_results['errors']:
        print(f"\n🔍 FAILED TESTS:")
        for i, error in enumerate(test_results['errors'], 1):
            print(f"{i}. {error}")
            
    success_rate = (test_results['passed'] / test_results['total_tests'] * 100) if test_results['total_tests'] > 0 else 0
    print(f"\n📊 Success Rate: {success_rate:.1f}%")
    
    if success_rate >= 90:
        print("🎉 Excellent! Most tests passed.")
    elif success_rate >= 75:
        print("👍 Good! Most tests passed with some issues.")
    else:
        print("⚠️  Many tests failed. Review the errors above.")
        
    return test_results

if __name__ == "__main__":
    print("Starting TriniSaver Backend API Tests...")
    results = asyncio.run(main())
    
    # Exit with appropriate code
    if results['failed'] == 0:
        sys.exit(0)
    else:
        sys.exit(1)