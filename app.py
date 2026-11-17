#!/usr/bin/env python3
"""
Wishlist — a tiny local app.

Run:   python3 app.py
Open:  http://localhost:8765  (opens automatically)

Paste product links; the server visits each page and pulls the
title, price, photo and store name. Everything is saved to
wishlist.json next to this file. No packages to install.
"""

import gzip
import html
import json
import math
import os
import re
import sys
import threading
import time
import uuid
import webbrowser
import zlib
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

HOST = "127.0.0.1"
PORT = int(os.environ.get("WISHLIST_PORT", "8765"))
HERE = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(HERE, "wishlist.json")
PAGE_FILE = os.path.join(HERE, "index.html")
SETTINGS_FILE = os.path.join(HERE, "settings.json")
LOCK = threading.Lock()

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate",
}

CURRENCY_SYMBOLS = {"€": "EUR", "$": "USD", "£": "GBP", "₺": "TRY", "¥": "JPY"}


# ---------------------------------------------------------------- storage

def load_items():
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def save_items(items):
    _write_json(DATA_FILE, items)


# Share of the budget (after the cart) for each category, in percent.
DEFAULT_SHARES = {"die": 20, "need": 60, "": 20, "noturg": 0}


def load_settings():
    """Missing or unreadable settings.json = defaults (no budget, default shares)."""
    data = {}
    try:
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            loaded = json.load(f)
        if isinstance(loaded, dict):
            data = loaded
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    shares = data.get("shares") if isinstance(data.get("shares"), dict) else {}
    return {
        "budget": data.get("budget"),
        "shares": {**DEFAULT_SHARES, **{k: v for k, v in shares.items() if k in DEFAULT_SHARES}},
    }


def clean_budget(raw):
    if raw is None or raw == "":
        return None
    if isinstance(raw, bool):
        raise ValueError("budget must be a number or null")
    try:
        value = round(float(raw), 2)
    except (TypeError, ValueError):
        raise ValueError("budget must be a number or null")
    if not math.isfinite(value) or value < 0:
        raise ValueError("budget must be zero or more")
    return value


def clean_shares(raw):
    if not isinstance(raw, dict):
        raise ValueError("shares must be an object")
    out = {}
    for k, v in raw.items():
        if k not in DEFAULT_SHARES:
            continue
        if isinstance(v, bool):
            raise ValueError("shares must be numbers from 0 to 100")
        try:
            value = float(v)
        except (TypeError, ValueError):
            raise ValueError("shares must be numbers from 0 to 100")
        if not math.isfinite(value) or value < 0 or value > 100:
            raise ValueError("shares must be numbers from 0 to 100")
        out[k] = round(value, 2)
    return out


# ---------------------------------------------------------------- fetching

def fetch_html(url):
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=20) as resp:
        raw = resp.read(4_000_000)
        enc = (resp.headers.get("Content-Encoding") or "").lower()
        if enc == "gzip":
            raw = gzip.decompress(raw)
        elif enc == "deflate":
            try:
                raw = zlib.decompress(raw)
            except zlib.error:
                raw = zlib.decompress(raw, -zlib.MAX_WBITS)
        charset = resp.headers.get_content_charset() or "utf-8"
        final_url = resp.geturl()
    return raw.decode(charset, errors="replace"), final_url


class PageParser(HTMLParser):
    """Collects <meta>, <title>, JSON-LD blocks and a few <link>s."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.title = ""
        self.jsonld = []
        self.links = {}
        self._in_title = False
        self._in_jsonld = False
        self._buf = []

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "meta":
            key = (a.get("property") or a.get("name") or a.get("itemprop") or "").lower()
            val = a.get("content", "")
            if key and val and key not in self.meta:
                self.meta[key] = val.strip()
        elif tag == "title":
            self._in_title = True
            self._buf = []
        elif tag == "script" and "ld+json" in a.get("type", "").lower():
            self._in_jsonld = True
            self._buf = []
        elif tag == "link":
            rel = a.get("rel", "").lower()
            if rel and a.get("href") and rel not in self.links:
                self.links[rel] = a["href"]

    def handle_endtag(self, tag):
        if tag == "title" and self._in_title:
            self._in_title = False
            if not self.title:
                self.title = "".join(self._buf).strip()
        elif tag == "script" and self._in_jsonld:
            self._in_jsonld = False
            self.jsonld.append("".join(self._buf))

    def handle_data(self, data):
        if self._in_title or self._in_jsonld:
            self._buf.append(data)


def _walk(node):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


def _is_type(node, name):
    t = node.get("@type")
    if isinstance(t, list):
        return any(str(x).lower() == name for x in t)
    return str(t).lower() == name


def _first_image(img):
    if isinstance(img, str):
        return img
    if isinstance(img, list) and img:
        return _first_image(img[0])
    if isinstance(img, dict):
        return img.get("url") or img.get("contentUrl") or ""
    return ""


def _offer_price(offers):
    """Returns (price, currency) from a schema.org offers value."""
    for off in _walk(offers):
        price = off.get("price") or off.get("lowPrice")
        cur = off.get("priceCurrency", "")
        spec = off.get("priceSpecification")
        if not price and isinstance(spec, (dict, list)):
            for s in _walk(spec):
                if s.get("price"):
                    price, cur = s.get("price"), s.get("priceCurrency", cur)
                    break
        if price not in (None, ""):
            return str(price), cur
    return "", ""


def product_from_jsonld(blocks):
    for raw in blocks:
        try:
            data = json.loads(raw.strip().rstrip(";"))
        except json.JSONDecodeError:
            continue
        for node in _walk(data):
            if _is_type(node, "product") or _is_type(node, "productgroup"):
                price, cur = _offer_price(node.get("offers", {}))
                brand = node.get("brand")
                if isinstance(brand, dict):
                    brand = brand.get("name", "")
                return {
                    "title": node.get("name", ""),
                    "image": _first_image(node.get("image")),
                    "price": price,
                    "currency": cur,
                    "brand": brand if isinstance(brand, str) else "",
                }
    return {}


def _clean_text(s):
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip()


def split_price(text):
    """'€ 12,99' -> ('12,99', 'EUR')"""
    text = _clean_text(text)
    cur = ""
    for sym, code in CURRENCY_SYMBOLS.items():
        if sym in text:
            cur = code
            break
    m = re.search(r"\b([A-Z]{3})\b", text)
    if not cur and m:
        cur = m.group(1)
    num = re.search(r"\d[\d.,\s]*", text)
    return (num.group(0).strip() if num else ""), cur


def site_fallbacks(page, url):
    """Small extras for stores that hide data from meta tags (mainly Amazon)."""
    out = {}
    host = urlparse(url).netloc
    if "amazon." in host:
        m = re.search(r'id="productTitle"[^>]*>(.*?)</span>', page, re.S)
        if m:
            out["title"] = _clean_text(m.group(1))
        m = re.search(r'data-old-hires="(https?://[^"]+)"', page) or re.search(
            r'"hiRes":"(https?://[^"]+)"', page
        ) or re.search(r'id="landingImage"[^>]*src="(https?://[^"]+)"', page)
        if m:
            out["image"] = m.group(1)
        m = re.search(r'class="a-offscreen">\s*([^<]+)<', page)
        if m:
            out["price"], out["currency"] = split_price(m.group(1))
    return out


def store_name(url, meta):
    name = meta.get("og:site_name", "")
    if name:
        return _clean_text(name)
    host = urlparse(url).netloc.lower()
    host = re.sub(r"^(www\d?|m|shop|store)\.", "", host)
    parts = host.split(".")
    core = parts[-3] if len(parts) >= 3 and parts[-2] in ("co", "com") else parts[0]
    return core.capitalize()


# ---------------------------------------------------------------- titles

_CODE_CHARS = re.compile(r"[^A-Za-z0-9]")
_FRAGMENT = re.compile(r"[A-Za-z]{0,2}\d{1,3}")


def _token_core(tok):
    """Token without trademark signs and surrounding punctuation."""
    return re.sub(r"[™®©]", "", tok).strip(".,;:|-–—()[]/·'\"")


def _looks_like_code(tok):
    """Mixed letters and digits, 5+ characters: nf0a8d90, me141a0ef."""
    core = _token_core(tok)
    return (len(core) >= 5 and not _CODE_CHARS.search(core)
            and re.search(r"[A-Za-z]", core) is not None
            and re.search(r"\d", core) is not None)


def clean_title(title):
    """Remove trailing shop product codes from a title ("... nf0a8d90" -> "...").

    Works from the end: drops code-like tokens and a short fragment right after
    one (like "c12"), and stops at the first normal word. Never blanks a title.
    """
    text = _clean_text(title)
    tokens = text.split(" ") if text else []
    while tokens:
        last = _token_core(tokens[-1])
        if _looks_like_code(tokens[-1]):
            tokens.pop()
        elif len(tokens) > 1 and _FRAGMENT.fullmatch(last) and _looks_like_code(tokens[-2]):
            tokens.pop()
        else:
            break
    result = " ".join(tokens).rstrip(" -–—|,:;/·")
    if not result:
        return text
    return result[0].upper() + result[1:]


def scrape(url):
    page, final_url = fetch_html(url)
    p = PageParser()
    try:
        p.feed(page)
    except Exception:
        pass
    m = p.meta
    ld = product_from_jsonld(p.jsonld)
    fb = site_fallbacks(page, final_url)

    def pick(*vals):
        for v in vals:
            if v:
                return _clean_text(str(v))
        return ""

    title = pick(fb.get("title"), ld.get("title"), m.get("og:title"),
                 m.get("twitter:title"), m.get("title"), p.title)
    image = pick(fb.get("image"), ld.get("image"), m.get("og:image:secure_url"),
                 m.get("og:image"), m.get("twitter:image"), m.get("twitter:image:src"),
                 m.get("image"), p.links.get("image_src"))
    price = pick(ld.get("price"), m.get("product:price:amount"), m.get("og:price:amount"),
                 m.get("price"), fb.get("price"))
    currency = pick(ld.get("currency"), m.get("product:price:currency"),
                    m.get("og:price:currency"), m.get("pricecurrency"), fb.get("currency"))
    if price and not currency:
        price, currency = split_price(price)

    if image:
        image = urljoin(final_url, image)
        if image.startswith("//"):
            image = "https:" + image

    return {
        "title": clean_title(title)[:300],
        "raw_title": title[:300],
        "image": image,
        "price": price,
        "currency": currency.upper()[:3],
        "store": store_name(final_url, m),
        "brand": ld.get("brand", ""),
    }


# ---------------------------------------------------------------- HTTP

def new_item(url):
    item = {
        "id": uuid.uuid4().hex[:10],
        "url": url,
        "title": "",
        "raw_title": "",
        "image": "",
        "price": "",
        "currency": "",
        "store": "",
        "brand": "",
        "notes": "",
        "bought": False,
        "added": int(time.time()),
        "error": "",
    }
    fill(item)
    return item


def fill(item):
    try:
        info = scrape(item["url"])
        for k, v in info.items():
            if v or k not in item or not item[k]:
                item[k] = v
        item["error"] = "" if item["title"] else "No product details found on this page."
    except Exception as e:  # network error, 403, timeout …
        code = getattr(e, "code", None)
        why = f"the store answered {code}" if code else "network problem or timeout"
        item["error"] = f"Couldn't read this page ({why}). Try ↻ later or fill it in with Edit."
        sys.stderr.write(f"  fetch failed for {item['url']}: {e!r}\n")
        if not item["store"]:
            item["store"] = store_name(item["url"], {})
        if not item["title"]:
            item["title"] = title_from_url(item["url"])
    item["updated"] = int(time.time())


def title_from_url(url):
    path = urlparse(url).path.strip("/").split("/")
    words = max(path, key=len, default="") if path else ""
    words = re.sub(r"\.(html?|php|aspx?)$", "", words)
    words = re.sub(r"[-_+]+", " ", words)
    words = re.sub(r"\b(p|dp|ref)\d*\b", "", words, flags=re.I).strip()
    return words.capitalize() if len(words) > 3 else url


EDITABLE = {"title", "price", "currency", "notes", "bought", "image", "store",
            "tier", "rank", "in_cart", "group", "plan_skip"}
TIERS = ("", "die", "need", "noturg")  # "" = Everything else
ERROR_FIELDS = ("title", "price", "currency", "store", "image")


def clean_changes(raw):
    """Keep only editable fields and check their types. Raises ValueError/TypeError."""
    if not isinstance(raw, dict):
        raise ValueError("changes must be an object")
    out = {}
    for k, v in raw.items():
        if k not in EDITABLE:
            continue
        if k == "tier":
            if v not in TIERS:
                raise ValueError("unknown category")
        elif k == "rank":
            v = int(v)
        elif k in ("bought", "in_cart", "plan_skip"):
            v = bool(v)
        elif k == "group":
            v = str(v or "").strip()[:80]
        out[k] = v
    return out


def apply_changes(item, changes):
    # Filling in a hand-entered field clears the "Couldn't read this page" warning.
    if any(item.get(k) != v for k, v in changes.items() if k in ERROR_FIELDS):
        item["error"] = ""
    item.update(changes)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("  " + (fmt % args) + "\n")

    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return {}
        return data if isinstance(data, dict) else {}

    def _parts(self):
        return [p for p in urlparse(self.path).path.split("/") if p]

    def do_GET(self):
        parts = self._parts()
        if not parts:
            with open(PAGE_FILE, "rb") as f:
                return self._send(200, f.read(), "text/html")
        if parts == ["api", "items"]:
            with LOCK:
                return self._send(200, load_items())
        if parts == ["api", "settings"]:
            with LOCK:
                return self._send(200, load_settings())
        self._send(404, {"error": "not found"})

    def do_POST(self):
        parts = self._parts()
        if parts == ["api", "items"]:
            url = str(self._body().get("url", "")).strip()
            if not re.match(r"^https?://", url):
                return self._send(400, {"error": "Paste a full link starting with http(s)://"})
            item = new_item(url)  # network work happens outside the lock
            with LOCK:
                items = load_items()
                items.insert(0, item)
                save_items(items)
            return self._send(201, item)
        if len(parts) == 4 and parts[:2] == ["api", "items"] and parts[3] == "refresh":
            with LOCK:
                item = next((i for i in load_items() if i["id"] == parts[2]), None)
            if not item:
                return self._send(404, {"error": "not found"})
            fill(item)
            with LOCK:
                items = [item if i["id"] == item["id"] else i for i in load_items()]
                save_items(items)
            return self._send(200, item)
        if parts == ["api", "items", "order"]:
            ids = self._body().get("ids")
            if not isinstance(ids, list) or not all(isinstance(x, str) for x in ids):
                return self._send(400, {"error": "ids must be a list of item ids"})
            pos = {x: n for n, x in enumerate(ids)}
            with LOCK:
                items = load_items()
                for i in items:
                    if i["id"] in pos:
                        i["rank"] = pos[i["id"]]
                save_items(items)
            return self._send(200, {"ordered": len(pos)})
        if parts == ["api", "items", "bulk"]:
            body = self._body()
            ids = body.get("ids")
            if not isinstance(ids, list) or not all(isinstance(x, str) for x in ids):
                return self._send(400, {"error": "ids must be a list of item ids"})
            try:
                changes = clean_changes(body.get("changes"))
            except (ValueError, TypeError) as e:
                return self._send(400, {"error": str(e)})
            if not changes:
                return self._send(400, {"error": "nothing to change"})
            wanted = set(ids)
            with LOCK:
                items = load_items()
                n = 0
                for i in items:
                    if i["id"] in wanted:
                        apply_changes(i, changes)
                        n += 1
                save_items(items)
            return self._send(200, {"updated": n})
        self._send(404, {"error": "not found"})

    def do_PATCH(self):
        parts = self._parts()
        if len(parts) == 3 and parts[:2] == ["api", "items"]:
            try:
                changes = clean_changes(self._body())
            except (ValueError, TypeError) as e:
                return self._send(400, {"error": str(e)})
            with LOCK:
                items = load_items()
                for i in items:
                    if i["id"] == parts[2]:
                        apply_changes(i, changes)
                        save_items(items)
                        return self._send(200, i)
            return self._send(404, {"error": "not found"})
        self._send(404, {"error": "not found"})

    def do_PUT(self):
        parts = self._parts()
        if parts == ["api", "settings"]:
            body = self._body()
            try:
                budget_given = "budget" in body
                budget = clean_budget(body.get("budget")) if budget_given else None
                shares_given = "shares" in body
                shares = clean_shares(body.get("shares")) if shares_given else None
            except (ValueError, TypeError) as e:
                return self._send(400, {"error": str(e)})
            with LOCK:
                settings = load_settings()
                if budget_given:
                    settings["budget"] = budget
                if shares_given:
                    settings["shares"] = {**settings["shares"], **shares}
                _write_json(SETTINGS_FILE, settings)
            return self._send(200, settings)
        self._send(404, {"error": "not found"})

    def do_DELETE(self):
        parts = self._parts()
        if len(parts) == 3 and parts[:2] == ["api", "items"]:
            with LOCK:
                items = load_items()
                kept = [i for i in items if i["id"] != parts[2]]
                save_items(kept)
            return self._send(200, {"deleted": len(items) - len(kept)})
        self._send(404, {"error": "not found"})


def clean_titles_cli():
    """python3 app.py --clean-titles         preview, then ask before saving
    python3 app.py --clean-titles --apply   save without asking"""
    import shutil
    items = load_items()
    changes = []
    for i in items:
        before = i.get("title", "")
        after = clean_title(before)
        if after != before:
            changes.append((i, before, after))
    print(f"\n  {len(changes)} of {len(items)} titles will change.")
    for _, before, after in changes[:8]:
        print(f"    before: {before}\n    after:  {after}\n")
    if not changes:
        return
    apply = "--apply" in sys.argv
    if not apply:
        if not sys.stdin.isatty():
            print("  Nothing saved. Run with --apply to save without asking.")
            return
        apply = input(f"  Save these {len(changes)} changes? (a backup is kept) [y/N] ").strip().lower() == "y"
        if not apply:
            print("  Nothing saved.")
            return
    shutil.copy2(DATA_FILE, DATA_FILE + ".before-titles.bak")
    for i, before, after in changes:
        if not i.get("raw_title"):
            i["raw_title"] = before
        i["title"] = after
    save_items(items)
    print(f"  Saved. Original titles are kept in raw_title. Backup: {DATA_FILE}.before-titles.bak")


def main():
    if "--clean-titles" in sys.argv:
        return clean_titles_cli()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"\n  Wishlist running at {url}\n  Data file: {DATA_FILE}\n  Ctrl+C to stop.\n")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bye.")


if __name__ == "__main__":
    main()
