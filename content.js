// content.js
// Runs on Amazon and Best Buy pages. It only reads the product name and price
// when the popup asks for them. It never sends anything anywhere by itself.

(function () {
  // Return the text of the first selector that matches something non-empty.
  function readText(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return null;
  }

  // Turn "$1,299.99" into 1299.99. Returns null if no price is found.
  function parsePrice(text) {
    if (!text) return null;
    const match = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
    return match ? parseFloat(match[1].replace(/,/g, "")) : null;
  }

  function getAmazonProduct() {
    const name = readText(["#productTitle"]);
    const priceText = readText([
      "#corePrice_feature_div .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-offscreen",
      ".priceToPay .a-offscreen",
      ".a-price .a-offscreen"
    ]);
    return { retailer: "amazon", name, price: parsePrice(priceText) };
  }

  function getBestBuyProduct() {
    const name = readText([".sku-title h1", "h1"]);
    const priceText = readText([
      '[data-testid="customer-price"] span',
      '.priceView-customer-price span[aria-hidden="true"]',
      '.priceView-hero-price span[aria-hidden="true"]'
    ]);
    return { retailer: "bestbuy", name, price: parsePrice(priceText) };
  }

  // The popup sends { type: "GET_PRODUCT" } and we answer right away.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "GET_PRODUCT") return;

    const host = location.hostname;
    let product = null;
    if (host.includes("amazon.")) product = getAmazonProduct();
    if (host.includes("bestbuy.")) product = getBestBuyProduct();

    if (!product || !product.name) {
      sendResponse({
        ok: false,
        error: "No product found on this page. Open a product page and try again."
      });
    } else if (product.price === null) {
      sendResponse({
        ok: false,
        error: "Found the product, but couldn't read its price. It may be out of stock or have several options."
      });
    } else {
      sendResponse({ ok: true, product });
    }
  });
})();
