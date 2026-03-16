"""
TriniSaver Shopping List Feature Tests
Tests for:
- GET /api/product-categories: Returns products grouped by category
- POST /api/shopping-lists: Create new shopping list (auth required)
- GET /api/shopping-lists: Get user's shopping lists (auth required)
- PUT /api/shopping-lists/{list_id}: Update list name and items
- DELETE /api/shopping-lists/{list_id}: Delete a shopping list
"""
import pytest
import requests
import os

# Use public backend URL for testing
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://shop-link-tt.preview.emergentagent.com').rstrip('/')

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
    return response.json()["token"]

class TestProductCategories:
    """Test product categories endpoint for shopping list builder"""
    
    def test_get_product_categories(self, api_client):
        """Test: GET /api/product-categories returns products grouped by category"""
        response = api_client.get(f"{BASE_URL}/api/product-categories")
        assert response.status_code == 200, f"Product categories failed: {response.text}"
        
        categories = response.json()
        assert isinstance(categories, dict), "Should return a dictionary"
        assert len(categories) > 0, "Should have at least one category"
        
        # Check structure - should be category name -> list of products
        for cat_name, products in categories.items():
            assert isinstance(products, list), f"Category {cat_name} should have a list of products"
            assert len(products) > 0, f"Category {cat_name} should have products"
            
            # Check product structure
            product = products[0]
            assert "product_id" in product, "Product should have product_id"
            assert "name" in product, "Product should have name"
            assert "unit_type" in product, "Product should have unit_type"
            assert "_id" not in product, "MongoDB _id should be excluded"
        
        print(f"✓ Product categories: {len(categories)} categories returned")
        print(f"  Categories: {', '.join(categories.keys())}")
        
        # Verify expected categories exist
        expected_categories = ["Grains & Rice", "Cooking Oil", "Baking", "Dairy", "Toiletries"]
        for expected in expected_categories:
            if expected in categories:
                print(f"  ✓ {expected}: {len(categories[expected])} products")

class TestShoppingListCRUD:
    """Test shopping list CRUD operations"""
    
    def test_create_shopping_list(self, api_client, test_user_token):
        """Test: POST /api/shopping-lists creates a new list with items"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        list_data = {
            "name": "TEST_Weekly Groceries",
            "items": [
                {"id": "item_1", "name": "Curepe Long Grain Rice 5kg", "category": "Grains & Rice", "quantity": 2, "unit": "kg", "checked": False},
                {"id": "item_2", "name": "Coconut Oil 1L", "category": "Cooking Oil", "quantity": 1, "unit": "L", "checked": False},
                {"id": "item_3", "name": "Custom Item - Hot Pepper", "category": "General", "quantity": 3, "unit": "each", "checked": False}
            ]
        }
        
        response = api_client.post(f"{BASE_URL}/api/shopping-lists", json=list_data, headers=headers)
        assert response.status_code == 200, f"Create shopping list failed: {response.text}"
        
        data = response.json()
        assert "list_id" in data, "Should return list_id"
        assert "user_id" in data, "Should have user_id"
        assert data["name"] == list_data["name"], "List name should match"
        assert len(data["items"]) == 3, "Should have 3 items"
        assert "created_at" in data, "Should have created_at timestamp"
        assert "updated_at" in data, "Should have updated_at timestamp"
        assert "_id" not in data, "MongoDB _id should be excluded"
        
        print(f"✓ Created shopping list: {data['name']}, list_id: {data['list_id']}, items: {len(data['items'])}")
        
        # Verify by fetching the list
        get_resp = api_client.get(f"{BASE_URL}/api/shopping-lists", headers=headers)
        assert get_resp.status_code == 200
        lists = get_resp.json()
        found = any(lst["list_id"] == data["list_id"] for lst in lists)
        assert found, "Created list should appear in GET /api/shopping-lists"
        print(f"✓ List persisted and retrievable")
        
        return data
    
    def test_create_list_requires_auth(self, api_client):
        """Test: POST /api/shopping-lists without auth returns 401"""
        list_data = {"name": "Test List", "items": []}
        response = api_client.post(f"{BASE_URL}/api/shopping-lists", json=list_data)
        assert response.status_code == 401, "Should require authentication"
        print(f"✓ Create list without auth correctly returns 401")
    
    def test_get_user_shopping_lists(self, api_client, test_user_token):
        """Test: GET /api/shopping-lists returns user's lists"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        response = api_client.get(f"{BASE_URL}/api/shopping-lists", headers=headers)
        assert response.status_code == 200, f"Get shopping lists failed: {response.text}"
        
        lists = response.json()
        assert isinstance(lists, list), "Should return a list"
        
        # Should have at least the existing "Weekly Groceries" list
        assert len(lists) >= 1, "Test user should have at least one list (seeded or created)"
        
        # Check structure
        if len(lists) > 0:
            lst = lists[0]
            assert "list_id" in lst
            assert "name" in lst
            assert "items" in lst
            assert "created_at" in lst
            assert "updated_at" in lst
            assert "_id" not in lst
            print(f"✓ Get shopping lists: {len(lists)} lists returned")
            print(f"  First list: {lst['name']} ({len(lst['items'])} items)")
    
    def test_get_lists_requires_auth(self, api_client):
        """Test: GET /api/shopping-lists without auth returns 401"""
        response = api_client.get(f"{BASE_URL}/api/shopping-lists")
        assert response.status_code == 401, "Should require authentication"
        print(f"✓ Get lists without auth correctly returns 401")
    
    def test_update_shopping_list(self, api_client, test_user_token):
        """Test: PUT /api/shopping-lists/{list_id} updates list name and items"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # First create a list
        create_data = {
            "name": "TEST_List To Update",
            "items": [
                {"id": "item_1", "name": "Rice", "category": "Grains & Rice", "quantity": 1, "unit": "kg", "checked": False}
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-lists", json=create_data, headers=headers)
        assert create_resp.status_code == 200
        list_id = create_resp.json()["list_id"]
        
        # Update the list
        update_data = {
            "name": "TEST_Updated List Name",
            "items": [
                {"id": "item_1", "name": "Rice", "category": "Grains & Rice", "quantity": 2, "unit": "kg", "checked": True},
                {"id": "item_2", "name": "Oil", "category": "Cooking Oil", "quantity": 1, "unit": "L", "checked": False}
            ]
        }
        response = api_client.put(f"{BASE_URL}/api/shopping-lists/{list_id}", json=update_data, headers=headers)
        assert response.status_code == 200, f"Update shopping list failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "TEST_Updated List Name", "List name should be updated"
        assert len(data["items"]) == 2, "Should have 2 items after update"
        assert data["items"][0]["quantity"] == 2, "First item quantity should be updated"
        assert data["items"][0]["checked"] == True, "First item should be checked"
        print(f"✓ Updated shopping list: {data['name']}, items: {len(data['items'])}")
        
        # Verify by GET
        get_resp = api_client.get(f"{BASE_URL}/api/shopping-lists", headers=headers)
        lists = get_resp.json()
        updated_list = next((lst for lst in lists if lst["list_id"] == list_id), None)
        assert updated_list is not None
        assert updated_list["name"] == "TEST_Updated List Name"
        assert len(updated_list["items"]) == 2
        print(f"✓ Update persisted correctly")
    
    def test_update_nonexistent_list(self, api_client, test_user_token):
        """Test: PUT /api/shopping-lists/{invalid_id} returns 404"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        update_data = {"name": "Test", "items": []}
        response = api_client.put(f"{BASE_URL}/api/shopping-lists/list_nonexistent", json=update_data, headers=headers)
        assert response.status_code == 404, "Should return 404 for nonexistent list"
        print(f"✓ Update nonexistent list correctly returns 404")
    
    def test_delete_shopping_list(self, api_client, test_user_token):
        """Test: DELETE /api/shopping-lists/{list_id} deletes a list"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # Create a list to delete
        create_data = {
            "name": "TEST_List To Delete",
            "items": [{"id": "item_1", "name": "Test Item", "category": "General", "quantity": 1, "unit": "each", "checked": False}]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-lists", json=create_data, headers=headers)
        assert create_resp.status_code == 200
        list_id = create_resp.json()["list_id"]
        
        # Delete the list
        response = api_client.delete(f"{BASE_URL}/api/shopping-lists/{list_id}", headers=headers)
        assert response.status_code == 200, f"Delete shopping list failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        assert "deleted" in data["message"].lower()
        print(f"✓ Deleted shopping list: {list_id}")
        
        # Verify deletion by GET
        get_resp = api_client.get(f"{BASE_URL}/api/shopping-lists", headers=headers)
        lists = get_resp.json()
        found = any(lst["list_id"] == list_id for lst in lists)
        assert not found, "Deleted list should not appear in GET response"
        print(f"✓ List successfully removed from database")
    
    def test_delete_nonexistent_list(self, api_client, test_user_token):
        """Test: DELETE /api/shopping-lists/{invalid_id} returns 404"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        response = api_client.delete(f"{BASE_URL}/api/shopping-lists/list_nonexistent", headers=headers)
        assert response.status_code == 404, "Should return 404 for nonexistent list"
        print(f"✓ Delete nonexistent list correctly returns 404")
    
    def test_user_cannot_update_other_user_list(self, api_client):
        """Test: User can only update their own lists, not other users' lists"""
        # Create two users
        import uuid
        user1_data = {"email": f"TEST_user1_{uuid.uuid4().hex[:8]}@test.com", "password": "pass123", "name": "User 1", "region": "North"}
        user2_data = {"email": f"TEST_user2_{uuid.uuid4().hex[:8]}@test.com", "password": "pass123", "name": "User 2", "region": "South"}
        
        # Register and login user 1
        reg1 = api_client.post(f"{BASE_URL}/api/auth/register", json=user1_data)
        token1 = reg1.json()["token"]
        headers1 = {"Authorization": f"Bearer {token1}"}
        
        # Register and login user 2
        reg2 = api_client.post(f"{BASE_URL}/api/auth/register", json=user2_data)
        token2 = reg2.json()["token"]
        headers2 = {"Authorization": f"Bearer {token2}"}
        
        # User 1 creates a list
        create_data = {"name": "TEST_User1 List", "items": []}
        create_resp = api_client.post(f"{BASE_URL}/api/shopping-lists", json=create_data, headers=headers1)
        list_id = create_resp.json()["list_id"]
        
        # User 2 tries to update User 1's list
        update_data = {"name": "Hacked", "items": []}
        response = api_client.put(f"{BASE_URL}/api/shopping-lists/{list_id}", json=update_data, headers=headers2)
        assert response.status_code == 404, "User should not be able to update another user's list (should return 404)"
        print(f"✓ User isolation: User 2 cannot update User 1's list (404)")
        
        # Verify list unchanged
        get_resp = api_client.get(f"{BASE_URL}/api/shopping-lists", headers=headers1)
        lists = get_resp.json()
        user1_list = next((lst for lst in lists if lst["list_id"] == list_id), None)
        assert user1_list["name"] == "TEST_User1 List", "User 1's list should remain unchanged"
        print(f"✓ List isolation verified: User 1's list unchanged")
