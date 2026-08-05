#!/usr/bin/env python3
"""
Deep backend testing for Kand AI endpoints
Tests all AI-powered endpoints end-to-end
"""

import requests
import json
import sys
from typing import Dict, Any, List

BASE_URL = "https://8a3b94de-dd76-4d1b-992c-9978c5fbd4ff.preview.emergentagent.com"
BANNED_JARGON = ["unlock", "elevate", "empower", "unleash", "seamless", "revolutionary", "leverage", "synergy"]

class TestResults:
    def __init__(self):
        self.tests = []
        self.passed = 0
        self.failed = 0
    
    def add(self, endpoint: str, status: int, passed: bool, observation: str, sample: Any = None):
        self.tests.append({
            "endpoint": endpoint,
            "status": status,
            "passed": passed,
            "observation": observation,
            "sample": sample
        })
        if passed:
            self.passed += 1
        else:
            self.failed += 1
    
    def print_summary(self):
        print("\n" + "="*80)
        print("BACKEND TEST RESULTS SUMMARY")
        print("="*80)
        print(f"Total Tests: {len(self.tests)} | Passed: {self.passed} | Failed: {self.failed}")
        print("="*80 + "\n")
        
        for test in self.tests:
            status_icon = "✅" if test["passed"] else "❌"
            print(f"{status_icon} {test['endpoint']}")
            print(f"   Status: {test['status']} | {test['observation']}")
            if test.get("sample"):
                sample_str = json.dumps(test["sample"], indent=2)
                if len(sample_str) > 500:
                    sample_str = sample_str[:500] + "..."
                print(f"   Sample: {sample_str}")
            print()

results = TestResults()

def check_for_mixtral(data: Any) -> bool:
    """Check if response contains deprecated mixtral model reference"""
    data_str = json.dumps(data).lower()
    return "mixtral" in data_str or "8x7b" in data_str

def check_banned_jargon(text: str) -> List[str]:
    """Check for banned corporate jargon"""
    found = []
    text_lower = text.lower()
    for word in BANNED_JARGON:
        if word in text_lower:
            found.append(word)
    return found

print("="*80)
print("KAND AI BACKEND DEEP TEST")
print("="*80)
print(f"Base URL: {BASE_URL}")
print(f"Testing AI endpoints with Groq llama-3.3-70b-versatile")
print("="*80 + "\n")

# Test 1: Extract Brand Info
print("TEST 1: POST /api/extract-brand-info")
print("-" * 80)
try:
    response = requests.post(
        f"{BASE_URL}/api/extract-brand-info",
        json={"url": "https://linear.app"},
        timeout=60
    )
    data = response.json()
    
    has_mixtral = check_for_mixtral(data)
    has_business_name = bool(data.get("businessName", "").strip())
    has_description = bool(data.get("description", "").strip())
    has_audience = bool(data.get("targetAudience", "").strip())
    has_voice = bool(data.get("brandVoice", "").strip())
    
    passed = (
        response.status_code == 200 and
        not has_mixtral and
        has_business_name and
        has_description
    )
    
    observation = f"Extracted: name={has_business_name}, desc={has_description}, audience={has_audience}, voice={has_voice}"
    if has_mixtral:
        observation += " | ⚠️ MIXTRAL DETECTED"
    
    results.add("POST /api/extract-brand-info", response.status_code, passed, observation, {
        "businessName": data.get("businessName", "")[:100],
        "description": data.get("description", "")[:150],
        "targetAudience": data.get("targetAudience", "")[:100]
    })
    
    print(f"Status: {response.status_code}")
    print(f"Result: {'✅ PASS' if passed else '❌ FAIL'}")
    print(f"Business Name: {data.get('businessName', 'N/A')}")
    print(f"Description: {data.get('description', 'N/A')[:200]}")
    
except Exception as e:
    print(f"❌ FAILED: {str(e)}")
    results.add("POST /api/extract-brand-info", 0, False, f"Exception: {str(e)}")

print("\n")

# Test 2: Generate Brand Questions
print("TEST 2: POST /api/generate-brand-questions")
print("-" * 80)
try:
    response = requests.post(
        f"{BASE_URL}/api/generate-brand-questions",
        json={"brandContext": "Linear is an issue tracker and project management tool for modern software teams, focused on speed and keyboard-first workflow."},
        timeout=60
    )
    data = response.json()
    
    has_mixtral = check_for_mixtral(data)
    questions = data.get("questions", [])
    all_end_with_question = all(q.strip().endswith("?") for q in questions)
    
    passed = (
        response.status_code == 200 and
        data.get("success") == True and
        len(questions) == 5 and
        all_end_with_question and
        not has_mixtral
    )
    
    observation = f"Generated {len(questions)} questions, all end with '?': {all_end_with_question}"
    if has_mixtral:
        observation += " | ⚠️ MIXTRAL DETECTED"
    
    results.add("POST /api/generate-brand-questions", response.status_code, passed, observation, {
        "success": data.get("success"),
        "question_count": len(questions),
        "sample_questions": questions[:2]
    })
    
    print(f"Status: {response.status_code}")
    print(f"Result: {'✅ PASS' if passed else '❌ FAIL'}")
    print(f"Questions ({len(questions)}):")
    for i, q in enumerate(questions, 1):
        print(f"  {i}. {q}")
    
    # Store questions for later use
    brand_questions = questions
    
except Exception as e:
    print(f"❌ FAILED: {str(e)}")
    results.add("POST /api/generate-brand-questions", 0, False, f"Exception: {str(e)}")
    brand_questions = [
        "Which offer do you want to sell more of right now?",
        "What frustrates your ideal customer before they find you?",
        "What myth in your industry do you love breaking?",
        "Why do customers pick you over your closest competitor?",
        "What quick tip could you teach in one sentence?"
    ]

print("\n")

# Test 3: Create Flow
print("TEST 3: POST /api/flows (create flow)")
print("-" * 80)
try:
    response = requests.post(
        f"{BASE_URL}/api/flows",
        json={"name": "AI Backend Test Flow"},
        timeout=30
    )
    data = response.json()
    
    flow_id = data.get("id")
    passed = response.status_code == 200 and bool(flow_id)
    
    results.add("POST /api/flows", response.status_code, passed, f"Created flow with ID: {flow_id}", {
        "id": flow_id,
        "name": data.get("name")
    })
    
    print(f"Status: {response.status_code}")
    print(f"Result: {'✅ PASS' if passed else '❌ FAIL'}")
    print(f"Flow ID: {flow_id}")
    
except Exception as e:
    print(f"❌ FAILED: {str(e)}")
    results.add("POST /api/flows", 0, False, f"Exception: {str(e)}")
    flow_id = None

print("\n")

if not flow_id:
    print("❌ Cannot continue without flow ID")
    results.print_summary()
    sys.exit(1)

# Test 4: Update Flow with Brand Context
print("TEST 4: PUT /api/flows/{id} (update with brand context)")
print("-" * 80)
try:
    flow_data = {
        "id": flow_id,
        "name": "AI Backend Test Flow",
        "brandContext": {
            "businessName": "Linear",
            "description": "Issue tracker and project management tool for modern software teams, focused on speed and keyboard-first workflow.",
            "audience": "Engineering teams and product managers at fast-moving software companies.",
            "voice": "Confident, direct, no fluff."
        },
        "tone": "informative",
        "language": "english",
        "brandQuestions": brand_questions,
        "brandAnswers": {
            "0": "Our fastest issue tracker",
            "1": "Slow bloated PM tools like Jira",
            "2": "That devs hate all PM tools",
            "3": "Speed and keyboard-first UX",
            "4": "Use CMD+K to jump anywhere"
        },
        "selectedCanvases": [],
        "contentIdeas": []
    }
    
    response = requests.put(
        f"{BASE_URL}/api/flows/{flow_id}",
        json=flow_data,
        timeout=30
    )
    
    passed = response.status_code == 200
    
    results.add(f"PUT /api/flows/{flow_id}", response.status_code, passed, "Updated flow with brand context", {
        "brandContext": flow_data["brandContext"]["businessName"],
        "tone": flow_data["tone"],
        "language": flow_data["language"]
    })
    
    print(f"Status: {response.status_code}")
    print(f"Result: {'✅ PASS' if passed else '❌ FAIL'}")
    
except Exception as e:
    print(f"❌ FAILED: {str(e)}")
    results.add(f"PUT /api/flows/{flow_id}", 0, False, f"Exception: {str(e)}")

print("\n")

# Test 5: Generate Ideas
print("TEST 5: POST /api/flows/{id}/generate-ideas")
print("-" * 80)
try:
    response = requests.post(
        f"{BASE_URL}/api/flows/{flow_id}/generate-ideas",
        json={"language": "english"},
        timeout=60
    )
    data = response.json()
    
    has_mixtral = check_for_mixtral(data)
    ideas = data.get("ideas", [])
    
    # Check for banned jargon
    jargon_found = {}
    for i, idea in enumerate(ideas):
        banned = check_banned_jargon(idea)
        if banned:
            jargon_found[i] = banned
    
    passed = (
        response.status_code == 200 and
        len(ideas) == 8 and
        not has_mixtral
    )
    
    observation = f"Generated {len(ideas)} ideas"
    if jargon_found:
        observation += f" | ⚠️ Jargon found in {len(jargon_found)} ideas: {jargon_found}"
    if has_mixtral:
        observation += " | ⚠️ MIXTRAL DETECTED"
    
    results.add(f"POST /api/flows/{flow_id}/generate-ideas", response.status_code, passed, observation, {
        "idea_count": len(ideas),
        "sample_ideas": ideas[:3],
        "jargon_violations": jargon_found
    })
    
    print(f"Status: {response.status_code}")
    print(f"Result: {'✅ PASS' if passed else '❌ FAIL'}")
    print(f"Ideas ({len(ideas)}):")
    for i, idea in enumerate(ideas, 1):
        jargon_marker = ""
        if i-1 in jargon_found:
            jargon_marker = f" ⚠️ [{', '.join(jargon_found[i-1])}]"
        print(f"  {i}. {idea}{jargon_marker}")
    
except Exception as e:
    print(f"❌ FAILED: {str(e)}")
    results.add(f"POST /api/flows/{flow_id}/generate-ideas", 0, False, f"Exception: {str(e)}")

print("\n")

# Test 6: Get Canvases
print("TEST 6: GET /api/canvases (find single canvas)")
print("-" * 80)
try:
    response = requests.get(f"{BASE_URL}/api/canvases", timeout=30)
    canvases = response.json()
    
    # Find a single canvas
    single_canvas = None
    for canvas in canvases:
        if canvas.get("type") == "single":
            single_canvas = canvas
            break
    
    # If no single canvas, create one
    if not single_canvas:
        print("No single canvas found, creating one...")
        create_response = requests.post(
            f"{BASE_URL}/api/canvases",
            json={"name": "Backend Test Canvas", "type": "single"},
            timeout=30
        )
        if create_response.status_code == 200:
            single_canvas = create_response.json()
    
    canvas_id = single_canvas.get("id") if single_canvas else None
    passed = response.status_code == 200 and bool(canvas_id)
    
    results.add("GET /api/canvases", response.status_code, passed, f"Found/created single canvas: {canvas_id}", {
        "canvas_count": len(canvases),
        "selected_canvas_id": canvas_id,
        "canvas_type": single_canvas.get("type") if single_canvas else None
    })
    
    print(f"Status: {response.status_code}")
    print(f"Result: {'✅ PASS' if passed else '❌ FAIL'}")
    print(f"Total canvases: {len(canvases)}")
    print(f"Selected canvas ID: {canvas_id}")
    
except Exception as e:
    print(f"❌ FAILED: {str(e)}")
    results.add("GET /api/canvases", 0, False, f"Exception: {str(e)}")
    canvas_id = None

print("\n")

if not canvas_id:
    print("❌ Cannot continue without canvas ID")
    results.print_summary()
    sys.exit(1)

# Test 7: Update Flow with Selected Canvas
print("TEST 7: PUT /api/flows/{id} (add selected canvas)")
print("-" * 80)
try:
    flow_data["selectedCanvases"] = [canvas_id]
    
    response = requests.put(
        f"{BASE_URL}/api/flows/{flow_id}",
        json=flow_data,
        timeout=30
    )
    
    passed = response.status_code == 200
    
    results.add(f"PUT /api/flows/{flow_id} (canvas)", response.status_code, passed, f"Added canvas {canvas_id} to flow", {
        "selectedCanvases": [canvas_id]
    })
    
    print(f"Status: {response.status_code}")
    print(f"Result: {'✅ PASS' if passed else '❌ FAIL'}")
    
except Exception as e:
    print(f"❌ FAILED: {str(e)}")
    results.add(f"PUT /api/flows/{flow_id} (canvas)", 0, False, f"Exception: {str(e)}")

print("\n")

# Test 8: Generate Posts
print("TEST 8: POST /api/flows/{id}/generate (generate posts)")
print("-" * 80)
try:
    response = requests.post(
        f"{BASE_URL}/api/flows/{flow_id}/generate",
        json={"language": "english", "carouselChance": 0},
        timeout=120
    )
    data = response.json()
    
    has_mixtral = check_for_mixtral(data)
    posts = data.get("posts", [])
    post_count = data.get("postCount", 0)
    
    # Verify post structure
    posts_valid = True
    render_urls = []
    for post in posts:
        if not post.get("caption"):
            posts_valid = False
        if not post.get("render", {}).get("url"):
            posts_valid = False
        else:
            render_urls.append(post["render"]["url"])
        if post.get("canvasType") != "single":
            posts_valid = False
    
    passed = (
        response.status_code == 200 and
        data.get("success") == True and
        post_count > 0 and
        len(posts) > 0 and
        posts_valid and
        not has_mixtral
    )
    
    observation = f"Generated {post_count} posts, all have caption & render URL, all single type"
    if has_mixtral:
        observation += " | ⚠️ MIXTRAL DETECTED"
    
    results.add(f"POST /api/flows/{flow_id}/generate", response.status_code, passed, observation, {
        "success": data.get("success"),
        "postCount": post_count,
        "sample_post": {
            "caption": posts[0].get("caption", "")[:100] if posts else None,
            "render_url": posts[0].get("render", {}).get("url") if posts else None,
            "canvasType": posts[0].get("canvasType") if posts else None
        }
    })
    
    print(f"Status: {response.status_code}")
    print(f"Result: {'✅ PASS' if passed else '❌ FAIL'}")
    print(f"Post Count: {post_count}")
    if posts:
        print(f"Sample Caption: {posts[0].get('caption', 'N/A')[:150]}")
        print(f"Sample Render URL: {posts[0].get('render', {}).get('url', 'N/A')}")
    
    # Test 8b: Verify render URL returns image
    if render_urls:
        print("\nTEST 8b: Verify render URL returns image")
        print("-" * 80)
        try:
            render_response = requests.get(render_urls[0], timeout=30)
            is_image = render_response.headers.get("content-type", "").startswith("image/")
            
            passed_render = render_response.status_code == 200 and is_image
            
            results.add(f"GET {render_urls[0][:50]}...", render_response.status_code, passed_render, 
                       f"Render URL returns image: {is_image}", {
                "content_type": render_response.headers.get("content-type"),
                "content_length": len(render_response.content)
            })
            
            print(f"Status: {render_response.status_code}")
            print(f"Result: {'✅ PASS' if passed_render else '❌ FAIL'}")
            print(f"Content-Type: {render_response.headers.get('content-type')}")
            print(f"Content-Length: {len(render_response.content)} bytes")
            
        except Exception as e:
            print(f"❌ FAILED: {str(e)}")
            results.add(f"GET render URL", 0, False, f"Exception: {str(e)}")
    
except Exception as e:
    print(f"❌ FAILED: {str(e)}")
    results.add(f"POST /api/flows/{flow_id}/generate", 0, False, f"Exception: {str(e)}")

print("\n")

# Test 9: AI Copy
print("TEST 9: POST /api/ai-copy")
print("-" * 80)
try:
    response = requests.post(
        f"{BASE_URL}/api/ai-copy",
        json={
            "key": "headline",
            "topic": "launching a new feature",
            "brandContext": "Linear is the fastest issue tracker for developer teams",
            "tone": "aggressive"
        },
        timeout=60
    )
    data = response.json()
    
    has_mixtral = check_for_mixtral(data)
    text = data.get("text", "")
    word_count = len(text.split())
    has_quotes = text.startswith('"') or text.startswith("'")
    has_hashtags = "#" in text
    
    passed = (
        response.status_code == 200 and
        bool(text) and
        word_count <= 15 and
        not has_quotes and
        not has_hashtags and
        not has_mixtral
    )
    
    observation = f"Generated {word_count} words, no quotes: {not has_quotes}, no hashtags: {not has_hashtags}"
    if has_mixtral:
        observation += " | ⚠️ MIXTRAL DETECTED"
    
    results.add("POST /api/ai-copy", response.status_code, passed, observation, {
        "text": text,
        "word_count": word_count
    })
    
    print(f"Status: {response.status_code}")
    print(f"Result: {'✅ PASS' if passed else '❌ FAIL'}")
    print(f"Text: {text}")
    print(f"Word Count: {word_count}")
    
except Exception as e:
    print(f"❌ FAILED: {str(e)}")
    results.add("POST /api/ai-copy", 0, False, f"Exception: {str(e)}")

print("\n")

# Print final summary
results.print_summary()

# Exit with appropriate code
sys.exit(0 if results.failed == 0 else 1)
