#!/usr/bin/env python3
"""
Backend Test Suite for DohPayDaTT Product Image Upload System
Testing new endpoints from image_routes.py
"""

import asyncio
import base64
import io
import json
import requests
from PIL import Image

# Backend URL from environment
BACKEND_URL = "https://shop-link-tt.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "admin@test.com"
ADMIN_PASSWORD = "test123"

class ProductImageUploadTester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
    
    def create_test_image(self) -> bytes:
        """Create a small test JPEG image"""
        # Create a 100x100 red square image
        img = Image.new('RGB', (100, 100), color='red')
        
        # Add some visual features (not uniform)
        for x in range(0, 100, 10):
            for y in range(0, 100, 10):
                # Add some blue squares to make it non-uniform
                if (x + y) % 20 == 0:
                    for i in range(5):
                        for j in range(5):
                            if x+i < 100 and y+j < 100:
                                img.putpixel((x+i, y+j), (0, 0, 255))
        
        # Convert to bytes
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=85)
        buffer.seek(0)
        return buffer.read()
    
    def create_multipart_data(self, image_bytes: bytes, product_name: str):
        """Create multipart form data for image upload"""
        files = {
            'file': ('test_image.jpg', image_bytes, 'image/jpeg'),
            'product_name': (None, product_name)
        }
        return files
    
    async def test_authentication(self):
        """Test admin login to get auth token"""
        try:
            response = self.session.post(f"{BACKEND_URL}/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            })
            
            if response.status_code == 200:
                data = response.json()
                self.auth_token = data.get("token")
                self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
                self.log_test("Admin Authentication", True, f"Logged in as {ADMIN_EMAIL}")
                return True
            else:
                self.log_test("Admin Authentication", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Admin Authentication", False, f"Exception: {str(e)}")
            return False
    
    async def test_get_products_empty(self):
        """Test GET /api/products - should return empty or seeded list"""
        try:
            response = self.session.get(f"{BACKEND_URL}/products")
            
            if response.status_code == 200:
                products = response.json()
                self.log_test("GET /api/products (initial)", True, f"Found {len(products)} products")
                return True
            else:
                self.log_test("GET /api/products (initial)", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("GET /api/products (initial)", False, f"Exception: {str(e)}")
            return False
    
    async def test_upload_product_image(self):
        """Test POST /api/products/upload-image with multipart form"""
        try:
            # Create test image
            image_bytes = self.create_test_image()
            
            # Create unique product name to avoid conflicts
            import uuid
            unique_name = f"Test Product Rice {uuid.uuid4().hex[:8]}"
            
            # Create multipart form data
            files = self.create_multipart_data(image_bytes, unique_name)
            
            response = self.session.post(f"{BACKEND_URL}/products/upload-image", files=files)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("product"):
                    product = data["product"]
                    self.test_product_id = product.get("product_id")
                    self.log_test("POST /api/products/upload-image", True, f"Created product: {product.get('name')} with ID: {self.test_product_id}")
                    return True
                else:
                    self.log_test("POST /api/products/upload-image", False, f"Invalid response structure: {data}")
                    return False
            else:
                self.log_test("POST /api/products/upload-image", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("POST /api/products/upload-image", False, f"Exception: {str(e)}")
            return False
    
    async def test_get_product_image(self):
        """Test GET /api/products/{product_id}/image"""
        if not hasattr(self, 'test_product_id'):
            self.log_test("GET /api/products/{product_id}/image", False, "No test product ID available")
            return False
        
        try:
            response = self.session.get(f"{BACKEND_URL}/products/{self.test_product_id}/image")
            
            if response.status_code == 200:
                data = response.json()
                if data.get("image_url") and data.get("item_id"):
                    self.log_test("GET /api/products/{product_id}/image", True, f"Retrieved image for product: {data.get('item_name')}")
                    return True
                else:
                    self.log_test("GET /api/products/{product_id}/image", False, f"Invalid response structure: {data}")
                    return False
            else:
                self.log_test("GET /api/products/{product_id}/image", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("GET /api/products/{product_id}/image", False, f"Exception: {str(e)}")
            return False
    
    async def test_get_products_with_search(self):
        """Test GET /api/products with search parameter"""
        try:
            response = self.session.get(f"{BACKEND_URL}/products?q=Rice")
            
            if response.status_code == 200:
                products = response.json()
                rice_products = [p for p in products if "rice" in p.get("name", "").lower()]
                self.log_test("GET /api/products (search)", True, f"Found {len(rice_products)} rice products out of {len(products)} total")
                return True
            else:
                self.log_test("GET /api/products (search)", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("GET /api/products (search)", False, f"Exception: {str(e)}")
            return False
    
    async def test_create_price_report(self):
        """Create a price report for testing attach-image endpoint"""
        try:
            # Use unique product name to avoid deduplication conflicts
            import uuid
            unique_product = f"Test Report Product {uuid.uuid4().hex[:8]}"
            
            report_data = {
                "product_name": unique_product,
                "store_name": "Massy Stores - Trincity",
                "price": 89.99,
                "quantity": 5.0,
                "unit": "kg"
            }
            
            response = self.session.post(f"{BACKEND_URL}/price-reports", json=report_data)
            
            if response.status_code == 200:
                data = response.json()
                report = data.get("report")
                if report:
                    self.test_report_id = report.get("report_id")
                    self.log_test("Create Price Report (for attach test)", True, f"Created report ID: {self.test_report_id}")
                    return True
                else:
                    self.log_test("Create Price Report (for attach test)", False, f"No report in response: {data}")
                    return False
            else:
                self.log_test("Create Price Report (for attach test)", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Create Price Report (for attach test)", False, f"Exception: {str(e)}")
            return False
    
    async def test_attach_image_to_report(self):
        """Test PATCH /api/price-reports/{report_id}/attach-image"""
        if not hasattr(self, 'test_report_id') or not hasattr(self, 'test_product_id'):
            self.log_test("PATCH /api/price-reports/{report_id}/attach-image", False, "Missing test report or product ID")
            return False
        
        try:
            # Use form data for the PATCH request
            data = {'product_id': self.test_product_id}
            
            response = self.session.patch(f"{BACKEND_URL}/price-reports/{self.test_report_id}/attach-image", data=data)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    self.log_test("PATCH /api/price-reports/{report_id}/attach-image", True, f"Attached product to report: {result.get('product_name')}")
                    return True
                else:
                    self.log_test("PATCH /api/price-reports/{report_id}/attach-image", False, f"Success=False: {result}")
                    return False
            else:
                self.log_test("PATCH /api/price-reports/{report_id}/attach-image", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("PATCH /api/price-reports/{report_id}/attach-image", False, f"Exception: {str(e)}")
            return False
    
    async def test_unauthorized_access(self):
        """Test that unauthorized access returns 401"""
        try:
            # Remove auth header temporarily
            original_headers = self.session.headers.copy()
            if "Authorization" in self.session.headers:
                del self.session.headers["Authorization"]
            
            # Try to upload without auth
            image_bytes = self.create_test_image()
            files = self.create_multipart_data(image_bytes, "Unauthorized Test")
            
            response = self.session.post(f"{BACKEND_URL}/products/upload-image", files=files)
            
            # Restore headers
            self.session.headers.update(original_headers)
            
            if response.status_code == 401:
                self.log_test("Unauthorized Access Test", True, "Correctly returned 401 for unauthorized upload")
                return True
            else:
                self.log_test("Unauthorized Access Test", False, f"Expected 401, got {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Unauthorized Access Test", False, f"Exception: {str(e)}")
            return False
    
    async def test_invalid_file_type(self):
        """Test that invalid file types are rejected"""
        try:
            # Create a fake "text file" as image
            fake_file_data = b"This is not an image file"
            
            files = {
                'file': ('test.txt', fake_file_data, 'text/plain'),
                'product_name': (None, 'Invalid File Test')
            }
            
            response = self.session.post(f"{BACKEND_URL}/products/upload-image", files=files)
            
            if response.status_code == 400:
                self.log_test("Invalid File Type Test", True, "Correctly rejected non-image file")
                return True
            else:
                self.log_test("Invalid File Type Test", False, f"Expected 400, got {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Invalid File Type Test", False, f"Exception: {str(e)}")
            return False
    
    async def run_all_tests(self):
        """Run all tests in sequence"""
        print("🧪 Starting Product Image Upload System Tests")
        print("=" * 60)
        
        # Authentication first
        if not await self.test_authentication():
            print("❌ Authentication failed - stopping tests")
            return
        
        # Test sequence
        await self.test_get_products_empty()
        await self.test_upload_product_image()
        await self.test_get_product_image()
        await self.test_get_products_with_search()
        await self.test_create_price_report()
        await self.test_attach_image_to_report()
        await self.test_unauthorized_access()
        await self.test_invalid_file_type()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.test_results if r["success"])
        total = len(self.test_results)
        
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['test']}")
        
        print(f"\n🎯 Results: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
        
        if passed == total:
            print("🎉 All tests passed! Product Image Upload system is working correctly.")
        else:
            print(f"⚠️  {total-passed} test(s) failed. Please review the issues above.")

async def main():
    tester = ProductImageUploadTester()
    await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())