// Builds app/ from src/audit-prep.html (the same page as the online version): local copies of the libraries
// replace the CDN links, and the desktop runtime is loaded before the page script.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const out = path.join(root, "app");
fs.mkdirSync(path.join(out, "vendor"), {recursive:true});
fs.copyFileSync(require.resolve("xlsx/dist/xlsx.full.min.js"), path.join(out, "vendor", "xlsx.full.min.js"));
fs.copyFileSync(require.resolve("jszip/dist/jszip.min.js"), path.join(out, "vendor", "jszip.min.js"));
fs.copyFileSync(path.join(root, "src", "local-claude.js"), path.join(out, "local-claude.js"));
let html = fs.readFileSync(path.join(root, "src", "audit-prep.html"), "utf8");
const swaps = [
  [/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\/[^"]+"><\/script>/, '<script src="vendor/xlsx.full.min.js"></script>'],
  [/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/[^"]+"><\/script>/, '<script src="vendor/jszip.min.js"></script>\n<script src="local-claude.js"></script>'],
];
for (const [re, rep] of swaps){ if (!re.test(html)) throw new Error("pattern not found: " + re); html = html.replace(re, rep); }
// the online page is published without a document skeleton, so add one
if (!/^\s*<!doctype/i.test(html)) html = '<!doctype html>\n<html lang="ar" dir="rtl">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n' + html + "\n</html>\n";
fs.writeFileSync(path.join(out, "index.html"), html);
console.log("app/ built");
