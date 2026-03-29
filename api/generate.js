// ============================================================
// RBSE Result Explorer — Serverless PDF Generator
// Vercel Serverless Function + Puppeteer
//
// POST /api/generate
// Body: { html: "<full HTML string>", filename: "optional" }
// Returns: application/pdf binary
// ============================================================

const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

// Increase Vercel body parser limit to 5MB
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: "5mb",
    },
  },
};

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { html, filename } = req.body || {};

  if (!html || typeof html !== "string") {
    return res.status(400).json({
      error: "Missing 'html' field in request body.",
      bodyType: typeof req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      htmlType: typeof html,
      htmlLen: html ? html.length : 0,
    });
  }

  let browser = null;

  try {
    // Launch headless Chromium
    browser = await puppeteer.launch({
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: { width: 794, height: 1123 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();

    // Set content — fires as soon as DOM is ready, not waiting for fonts
    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // Fonts are embedded as base64 data URIs — no network wait needed
    await page.evaluate("document.fonts.ready");

    // Generate PDF
    const pdfData = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });

    // Ensure it's a proper Buffer
    const pdf = Buffer.from(pdfData);

    // Set response headers
    const safeName = (filename || "report").replace(/[^a-zA-Z0-9_\-\. ]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
    res.setHeader("Content-Length", pdf.length);
    res.setHeader("Access-Control-Allow-Origin", "*");

    return res.status(200).end(pdf);
  } catch (err) {
    console.error("PDF generation failed:", err);
    return res.status(500).json({
      error: "PDF generation failed.",
      details: err.message,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
