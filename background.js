// background.js
// The popup asks us to look for a product at other stores. We fetch each
// store's public search page, pull out the first few results, and pick the
// cheapest one that looks like the same product.
//
// Privacy notes:
//  - Requests are sent with credentials: "omit", so no cookies or logins are sent.
//  - Nothing is saved. When the popup closes, the results are gone.

// ---------- Small helpers ----------

// Strip HTML tags and decode a few common entities.
function clean(text) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// "1,299.99" -> 1299.99
function toNumber(text) {
  return parseFloat(String(text).replace(/,/g, ""));
}

// Split a page into one chunk of HTML per search result.
// startRegex must have the "g" flag and match the opening tag of each result.
function getBlocks(html, startRegex, max) {
  const starts = [...html.matchAll(startRegex)].slice(0, max);
  return starts.map((match, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : match.index + 20000;
    return { tag: match[0], body: html.slice(match.index, end) };
  });
}

// Turn a possibly-relative link into a full https URL.
function absoluteUrl(href, base) {
  try {
    const url = new URL(href.replace(/&amp;/g, "&"), base);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// ---------- Retailers ----------
// To add a store: add one object here with an id, name, searchUrl(), and parse().
// parse() returns a list of { title, price, url }.

const RETAILERS = [
  {
    id: "amazon",
    name: "Amazon",
    searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
    parse(html) {
      const blocks = getBlocks(
        html,
        /<div[^>]*data-component-type="s-search-result"[^>]*>/g,
        8
      );
      return blocks
        .map(({ tag, body }) => {
          const asin = (tag.match(/data-asin="([A-Z0-9]{10})"/) || [])[1];
          const title = (
            body.match(/<h2[^>]*aria-label="([^"]+)"/) ||
            body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) ||
            []
          )[1];
          const price = (body.match(/class="a-offscreen">\s*\$([\d,]+(?:\.\d{2})?)/) || [])[1];
          if (!asin || !title || !price) return null;
          return {
            title: clean(title),
            price: toNumber(price),
            url: `https://www.amazon.com/dp/${asin}`
          };
        })
        .filter(Boolean);
    }
  },

  {
    id: "bestbuy",
    name: "Best Buy",
    searchUrl: (q) => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`,
    parse(html) {
      const blocks = getBlocks(html, /<li[^>]*class="[^"]*sku-item[^"]*"[^>]*>/g, 8);
      return blocks
        .map(({ body }) => {
          const link = body.match(/<h4[^>]*class="sku-title"[^>]*>\s*<a([^>]*)>([\s\S]*?)<\/a>/);
          const price = (body.match(/priceView-customer-price[\s\S]*?\$([\d,]+(?:\.\d{2})?)/) || [])[1];
          if (!link || !price) return null;
          const href = (link[1].match(/href="([^"]+)"/) || [])[1];
          const url = href ? absoluteUrl(href, "https://www.bestbuy.com") : null;
          if (!url) return null;
          return { title: clean(link[2]), price: toNumber(price), url };
        })
        .filter(Boolean);
    }
  },

  {
    id: "newegg",
    name: "Newegg",
    searchUrl: (q) => `https://www.newegg.com/p/pl?d=${encodeURIComponent(q)}`,
    parse(html) {
      const blocks = getBlocks(html, /<div[^>]*class="[^"]*item-cell[^"]*"[^>]*>/g, 8);
      return blocks
        .map(({ body }) => {
          const link = body.match(/<a([^>]*class="item-title"[^>]*)>([\s\S]*?)<\/a>/);
          const price = body.match(/price-current[^>]*>[\s\S]*?<strong>([\d,]+)<\/strong>\s*(?:<sup>(\.\d+)<\/sup>)?/);
          if (!link || !price) return null;
          const href = (link[1].match(/href="([^"]+)"/) || [])[1];
          const url = href ? absoluteUrl(href, "https://www.newegg.com") : null;
          if (!url) return null;
          return {
            title: clean(link[2]),
            price: toNumber(price[1] + (price[2] || "")),
            url
          };
        })
        .filter(Boolean);
    }
  }
];

// ---------- Matching ----------

// Make a shorter search phrase from a long product title.
// "Sony WH-1000XM5 Wireless Headphones, Black (2022)" -> "Sony WH-1000XM5 Wireless Headphones"
function buildQuery(name) {
  const firstPart = name.split(/[,|(]/)[0];
  return firstPart.trim().split(/\s+/).slice(0, 8).join(" ");
}

function tokenize(text) {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  return [...new Set(words)];
}

// From a list of search results, choose the cheapest one that looks like the
// same product. Two simple checks keep out wrong matches:
//  1. Most words from our search must appear in the result's title.
//  2. The price can't be far below ours (that's usually a case or accessory).
function pickBestMatch(results, query, currentPrice) {
  const queryWords = tokenize(query);
  const matches = results.filter((result) => {
    const titleWords = tokenize(result.title);
    const hits = queryWords.filter((w) => titleWords.includes(w)).length;
    const looksSame = queryWords.length > 0 && hits / queryWords.length >= 0.6;
    const priceIsRealistic = result.price >= currentPrice * 0.4;
    return looksSame && priceIsRealistic;
  });
  matches.sort((a, b) => a.price - b.price);
  return matches[0] || null;
}

// ---------- Searching ----------

async function searchRetailer(retailer, query, currentPrice) {
  const searchUrl = retailer.searchUrl(query);
  const base = { id: retailer.id, name: retailer.name, searchUrl };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(searchUrl, {
      credentials: "omit",
      headers: { Accept: "text/html" },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) return { ...base, status: "unavailable" };

    const html = await response.text();
    const results = retailer.parse(html);

    // Zero results usually means the store blocked us or changed its page layout.
    if (results.length === 0) return { ...base, status: "unavailable" };

    const best = pickBestMatch(results, query, currentPrice);
    if (!best) return { ...base, status: "nomatch" };

    return { ...base, status: "found", title: best.title, price: best.price, url: best.url };
  } catch (error) {
    return { ...base, status: "unavailable" };
  }
}

async function searchAlternatives(product) {
  const query = buildQuery(product.name);
  const others = RETAILERS.filter((r) => r.id !== product.retailer);
  const results = await Promise.all(
    others.map((retailer) => searchRetailer(retailer, query, product.price))
  );
  return { query, results };
}

// ---------- Messages from the popup ----------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SEARCH_ALTERNATIVES") {
    searchAlternatives(message.product).then(sendResponse);
    return true; // keeps the message channel open for the async reply
  }
});
