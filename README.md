# Syrup

A Chrome and Edge extension that finds better prices for products you're viewing on Amazon and Best Buy. No account, no tracking, nothing stored.

## Why Syrup?

Syrup is a privacy-first alternative to Honey. Honey's privacy statement describes collecting your shopping activity, and it was accused in December 2024 of replacing creators' affiliate cookies (PayPal disputes this). Syrup stores nothing, never touches affiliate links, and only reads a page when you click its icon. It compares prices only; it doesn't find coupon codes.

## What it does

On an Amazon.com or BestBuy.com product page, click the icon and Syrup:

1. Reads the product name and price.
2. Searches Amazon, Best Buy, and Newegg for the same product.
3. Shows prices, direct links, and a "X% cheaper elsewhere" banner if there are savings.

## Install

1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open a product page, refresh it, and click the Syrup icon.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension settings and permissions (Manifest V3) |
| `content.js` | Reads the product name and price from the page |
| `background.js` | Searches other stores and picks the best match |
| `popup.html` / `popup.js` / `styles.css` | The popup UI |

## Limitations

- Store search pages change, so a store may occasionally show "Couldn't read results".
- Matching isn't perfect. Check the product before buying.
- Prices exclude shipping and tax.
- Only `amazon.com` and `bestbuy.com` are supported.