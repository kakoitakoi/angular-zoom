import os
import json
import time
import requests
from collections import deque
from typing import Dict, List, Optional

CONFLUENCE_BASE_URL = "https://your-company.atlassian.net/wiki"
API_TOKEN = "YOUR_API_TOKEN"
EMAIL = "your-email@company.com"

START_PAGE_ID = "123456789"
OUTPUT_DIR = "confluence_dump"
PAGE_LIMIT = 1000

session = requests.Session()
session.auth = (EMAIL, API_TOKEN)
session.headers.update({
    "Accept": "application/json"
})

os.makedirs(OUTPUT_DIR, exist_ok=True)


def request_json(url: str, params: Optional[dict] = None) -> dict:
    resp = session.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_page_details(page_id: str) -> dict:
    # Cloud v2 page endpoint
    url = f"{CONFLUENCE_BASE_URL}/api/v2/pages/{page_id}"
    return request_json(url)


def get_page_body_storage(page_id: str) -> str:
    # У некоторых сценариев удобнее добирать тело через v1 content endpoint с expand/body.storage
    url = f"{CONFLUENCE_BASE_URL}/rest/api/content/{page_id}"
    data = request_json(url, params={"expand": "body.storage,version,space"})
    return data.get("body", {}).get("storage", {}).get("value", "")


def get_children(page_id: str) -> List[dict]:
    # Cloud v2 direct children
    results = []
    url = f"{CONFLUENCE_BASE_URL}/api/v2/pages/{page_id}/direct-children"

    while url:
        resp = session.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        batch = data.get("results", [])
        results.extend(batch)

        # v2 часто использует Link header / next url
        next_link = data.get("_links", {}).get("next")
        if next_link:
            if next_link.startswith("http"):
                url = next_link
            else:
                url = CONFLUENCE_BASE_URL + next_link
        else:
            url = None

    return results


def save_page(page_data: dict):
    page_id = str(page_data["id"])
    path = os.path.join(OUTPUT_DIR, f"{page_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(page_data, f, ensure_ascii=False, indent=2)


def crawl_from_page(start_page_id: str, max_pages: int = 1000):
    visited = set()
    queue = deque([start_page_id])
    total = 0

    while queue and total < max_pages:
        page_id = queue.popleft()
        if page_id in visited:
            continue

        visited.add(page_id)

        try:
            page_info = get_page_details(page_id)
            body_storage = get_page_body_storage(page_id)

            record = {
                "id": page_info.get("id"),
                "title": page_info.get("title"),
                "status": page_info.get("status"),
                "spaceId": page_info.get("spaceId"),
                "parentId": page_info.get("parentId"),
                "body_storage": body_storage,
                "webui": page_info.get("_links", {}).get("webui"),
            }

            save_page(record)
            print(f"[OK] {record['id']} | {record['title']}")
            total += 1

            children = get_children(page_id)
            for child in children:
                if child.get("type") == "page":
                    child_id = str(child["id"])
                    if child_id not in visited:
                        queue.append(child_id)

            time.sleep(0.2)

        except Exception as e:
            print(f"[ERROR] page_id={page_id}: {e}")

    print(f"Done. Crawled {total} pages.")


if __name__ == "__main__":
    crawl_from_page(START_PAGE_ID, PAGE_LIMIT)