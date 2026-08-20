import http.server
import socketserver
import json
import os
import urllib.parse
import webbrowser
from datetime import datetime

PORT = 8000
DATA_FILE = os.path.join(os.path.dirname(__file__), "expenses.json")

def load_expenses():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_expenses(expenses):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(expenses, f, indent=2)

def classify_expense(text, amount=None, merchant=None):
    """
    FinAI Classification Rule Engine
    """
    text_lower = text.lower()
    
    work_keywords = [
        "client", "project", "laptop", "software", "domain", "hosting", "server", "aws", "github", 
        "ad", "ads", "marketing", "facebook ad", "google ad", "office", "desk", "monitor", "hardware", 
        "travel", "flight", "hotel", "uber to client", "taxi for meeting", "conference", "consultant", 
        "zoom", "slack", "notion", "figma", "adobe", "subscription", "business meal", "coffee meeting"
    ]
    personal_keywords = [
        "grocery", "groceries", "supermarket", "food supplies", "personal", "casual", "clothes", 
        "clothing", "shoes", "movie", "cinema", "game", "netflix", "ps5", "xbox", "home item", 
        "dining out", "family dinner"
    ]
    
    domain = "WORK"
    category = "Office Expense"
    deductible = "YES (100%)"
    tax_category = "Schedule C - Office Expense"
    tax_tip = "Business expense eligible for 100% tax deduction."
    
    if any(k in text_lower for k in personal_keywords) and not any(k in text_lower for k in work_keywords):
        domain = "PERSONAL"
        category = "Household / Personal"
        deductible = "NO"
        tax_category = "None"
        tax_tip = "Personal living expenses are non-deductible under tax rules."
    else:
        if any(k in text_lower for k in ["starbucks", "coffee", "lunch", "dinner", "restaurant", "meal"]) and any(k in text_lower for k in ["client", "project", "business", "meeting", "lead"]):
            domain = "WORK"
            category = "Client Meal"
            deductible = "YES (50%)"
            tax_category = "Schedule C - Meals"
            tax_tip = "Business meals with clients or during work travel are 50% tax deductible. Keep notes on attendees and topics."
        elif any(k in text_lower for k in ["software", "subscription", "aws", "domain", "hosting", "github", "zoom", "adobe", "figma"]):
            domain = "WORK"
            category = "Software & Subscriptions"
            deductible = "YES (100%)"
            tax_category = "Schedule C - Software & Services"
            tax_tip = "100% tax deductible as standard business operations & software expenses."
        elif any(k in text_lower for k in ["laptop", "computer", "macbook", "ram", "monitor", "desk", "phone", "hardware", "camera"]):
            domain = "WORK"
            category = "Hardware & Equipment"
            deductible = "YES (100%)"
            tax_category = "Schedule C - Depreciable Assets / Sec 179"
            tax_tip = "Eligible for 100% deduction in year of purchase under Section 179 bonus depreciation."
        elif any(k in text_lower for k in ["ad", "ads", "marketing", "google ad", "facebook ad", "flyer", "promo"]):
            domain = "WORK"
            category = "Marketing & Advertising"
            deductible = "YES (100%)"
            tax_category = "Schedule C - Advertising"
            tax_tip = "Advertising and client acquisition costs are 100% deductible business expenses."
        elif any(k in text_lower for k in ["internet", "phone bill", "utility", "wifi", "cell phone"]):
            domain = "WORK"
            category = "Utilities & Internet"
            deductible = "PARTIAL"
            tax_category = "Schedule C - Utilities / Home Office"
            tax_tip = "Deductible based on the business-use percentage of your home office or phone usage."
        elif any(k in text_lower for k in ["flight", "hotel", "uber", "lyft", "taxi", "train", "parking"]):
            domain = "WORK"
            category = "Business Travel"
            deductible = "YES (100%)"
            tax_category = "Schedule C - Travel"
            tax_tip = "Travel expenses for client visits or conferences are 100% tax deductible."
            
    return {
        "domain": domain,
        "category": category,
        "deductible": deductible,
        "tax_category": tax_category,
        "tax_tip": tax_tip
    }


class FinAIHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/expenses":
            expenses = load_expenses()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(expenses).encode("utf-8"))
            return
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        if parsed.path == "/api/expenses":
            try:
                new_expense = json.loads(post_data)
                expenses = load_expenses()
                if not new_expense.get("id"):
                    new_expense["id"] = "exp_" + str(int(datetime.now().timestamp() * 1000))
                if not new_expense.get("createdAt"):
                    new_expense["createdAt"] = datetime.now().isoformat()
                expenses.insert(0, new_expense)
                save_expenses(expenses)
                
                self.send_response(201)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps(new_expense).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        if parsed.path == "/api/parse":
            try:
                data = json.loads(post_data)
                text = data.get("text", "")
                result = classify_expense(text)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/expenses/"):
            expense_id = parsed.path.replace("/api/expenses/", "")
            expenses = load_expenses()
            updated = [e for e in expenses if e.get("id") != expense_id]
            save_expenses(updated)
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode("utf-8"))
            return
            
        self.send_response(404)
        self.end_headers()


def run_server():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server_address = ('', PORT)
    with socketserver.TCPServer(server_address, FinAIHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 60)
        print(f"FinAI Server is running at: {url}")
        print(f"Storing financial data in: {DATA_FILE}")
        print("Press Ctrl+C to stop the server.")
        print("=" * 60)
        
        try:
            webbrowser.open(url)
        except Exception:
            pass
            
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down FinAI Server...")

if __name__ == "__main__":
    run_server()
