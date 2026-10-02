// popup.js
// Flow: ask the page for the product -> ask background.js to search other
// stores -> show the results. Nothing is stored.

const $ = (id) => document.getElementById(id);

// Show only one of the status sections at a time.
function showState(state) {
  $("loading").hidden = state !== "loading";
  $("error").hidden = state !== "error";
  $("results").hidden = state !== "results";
}

function showError(message) {
  $("error-text").textContent = message;
  showState("error");
}

function formatPrice(amount) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Small helper to build elements safely (textContent, never innerHTML,
// because the text comes from web pages we don't control).
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeLink(text, url) {
  const link = el("a", "link", text);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

// Ask the content script on the current tab for the product name and price.
async function getProductFromPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PRODUCT" });
  } catch (error) {
    // No content script on this tab: wrong website, or the page was opened
    // before the extension was installed.
    throw new Error(
      "Open an Amazon or Best Buy product page and try again. If you just installed Syrup, refresh the page first."
    );
  }

  if (!response || !response.ok) {
    throw new Error(response ? response.error : "Couldn't read this page.");
  }
  return response.product;
}

function renderProduct(product) {
  $("product-name").textContent = product.name;
  $("product-price").textContent = formatPrice(product.price);
  $("product").hidden = false;
}

function renderBanner(product, cheapest) {
  const banner = $("banner");
  banner.textContent = "";
  banner.className = "banner";

  if (!cheapest) {
    banner.classList.add("neutral");
    banner.appendChild(el("p", "banner-title", "No matching deals found"));
    banner.appendChild(el("p", "banner-sub", "We couldn't find this product at the other stores."));
    return;
  }

  const savings = product.price - cheapest.price;
  const percent = Math.round((savings / product.price) * 100);

  if (percent >= 1) {
    banner.classList.add("good");
    banner.appendChild(el("p", "banner-title", `${percent}% cheaper elsewhere`));
    banner.appendChild(
      el("p", "banner-sub", `Save ${formatPrice(savings)} at ${cheapest.name}`)
    );
  } else {
    banner.classList.add("neutral");
    banner.appendChild(el("p", "banner-title", "This is the best price we found"));
    banner.appendChild(el("p", "banner-sub", "No other store was cheaper."));
  }
}

function renderAlternatives(product, results) {
  const list = $("alternatives");
  list.textContent = "";

  // Matches first (cheapest on top), then stores with no match.
  const found = results.filter((r) => r.status === "found").sort((a, b) => a.price - b.price);
  const notFound = results.filter((r) => r.status !== "found");

  for (const item of found) {
    const row = el("li", "row");
    if (item.price < product.price) row.classList.add("cheaper");

    const info = el("div", "row-info");
    info.appendChild(el("p", "row-store", item.name));
    info.appendChild(el("p", "row-title", item.title));

    const side = el("div", "row-side");
    side.appendChild(el("p", "row-price", formatPrice(item.price)));
    side.appendChild(makeLink("View", item.url));

    row.appendChild(info);
    row.appendChild(side);
    list.appendChild(row);
  }

  for (const item of notFound) {
    const row = el("li", "row muted");

    const info = el("div", "row-info");
    info.appendChild(el("p", "row-store", item.name));
    info.appendChild(
      el(
        "p",
        "row-title",
        item.status === "nomatch" ? "No matching product found" : "Couldn't read results"
      )
    );

    const side = el("div", "row-side");
    side.appendChild(makeLink("Search", item.searchUrl));

    row.appendChild(info);
    row.appendChild(side);
    list.appendChild(row);
  }
}

async function init() {
  showState("loading");

  try {
    const product = await getProductFromPage();
    renderProduct(product);

    $("loading-text").textContent = "Searching other stores…";

    const data = await chrome.runtime.sendMessage({
      type: "SEARCH_ALTERNATIVES",
      product
    });

    if (!data || !data.results) {
      throw new Error("The search didn't return anything. Try again in a moment.");
    }

    const cheapest = data.results
      .filter((r) => r.status === "found")
      .sort((a, b) => a.price - b.price)[0];

    renderBanner(product, cheapest);
    renderAlternatives(product, data.results);
    showState("results");
  } catch (error) {
    showError(error.message);
  }
}

init();
