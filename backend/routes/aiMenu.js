
const express = require("express");
const multer = require("multer");
const { createWorker } = require("tesseract.js");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (req, file, callback) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new Error("Only JPG, PNG and WEBP menu images are supported.")
      );
    }

    callback(null, true);
  },
});

function cleanLine(line) {
  return String(line || "")
    .replace(/\s+/g, " ")
    .replace(/[|]/g, "I")
    .trim();
}

function looksLikeHeading(line) {
  const text = line.replace(/[:\-]+$/, "").trim();

  if (!text || text.length > 45) return false;
  if (/\d/.test(text)) return false;

  const knownCategories = [
    "soups",
    "starters",
    "snacks",
    "breakfast",
    "lunch",
    "dinner",
    "rice",
    "biryani",
    "noodles",
    "pasta",
    "pizza",
    "burgers",
    "sandwiches",
    "roti",
    "chapati",
    "curries",
    "vegetarian",
    "veg",
    "non veg",
    "seafood",
    "desserts",
    "sweets",
    "juices",
    "beverages",
    "drinks",
    "coffee",
    "tea",
    "ice cream",
  ];

  const normalized = text.toLowerCase();

  return (
    knownCategories.includes(normalized) ||
    /:$/.test(line) ||
    (text === text.toUpperCase() &&
      /[A-Z]/.test(text) &&
      text.split(" ").length <= 5)
  );
}

function extractPrice(line) {
  // Prefer numbers that look like prices, including ₹80, Rs. 80,
  // INR 80, or prices after dotted leaders.
  const patterns = [
    /(?:₹|rs\.?|inr)\s*(\d{1,6}(?:\.\d{1,2})?)\s*$/i,
    /(?:\.{2,}|…+)\s*(\d{1,6}(?:\.\d{1,2})?)\s*$/,
    /\s+(\d{1,6}(?:\.\d{1,2})?)\s*$/,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);

    if (match) {
      const price = Number(match[1]);

      if (Number.isFinite(price) && price >= 0) {
        return {
          price,
          name: cleanLine(line.slice(0, match.index))
            .replace(/[.\-–—:]+$/, "")
            .trim(),
        };
      }
    }
  }

  return {
    price: null,
    name: cleanLine(line),
  };
}

function parseMenuText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const categories = [];
  const items = [];

  let currentCategory = "Other";

  const seenItems = new Set();

  const ignoredLines = [
    /^menu$/i,
    /^food menu$/i,
    /^restaurant menu$/i,
    /^page\s+\d+$/i,
    /^www\./i,
    /^https?:\/\//i,
    /^phone\s*:/i,
    /^mobile\s*:/i,
    /^contact\s*:/i,
    /^address\s*:/i,
    /^fssai/i,
  ];

  for (const originalLine of lines) {
    const line = originalLine.replace(/^[•*▪\-]\s*/, "").trim();

    if (!line || line.length < 2 || line.length > 150) continue;
    if (ignoredLines.some((pattern) => pattern.test(line))) continue;

    const extracted = extractPrice(line);
    const name = extracted.name
      .replace(/^[\s:;,.]+|[\s:;,.]+$/g, "")
      .trim();

    if (looksLikeHeading(line) && extracted.price === null) {
      currentCategory = line.replace(/:$/, "").trim();

      if (
        !categories.some(
          (category) =>
            category.toLowerCase() === currentCategory.toLowerCase()
        )
      ) {
        categories.push(currentCategory);
      }

      continue;
    }

    // Ignore lines that are unlikely to be food or drink names.
    if (!name || name.length < 2) continue;
    if (/^\d+([.,]\d+)?$/.test(name)) continue;

    // OCR may encounter the same item on multiple menu pages.
    const key = `${name.toLowerCase()}|${extracted.price}|${currentCategory.toLowerCase()}`;

    if (seenItems.has(key)) continue;
    seenItems.add(key);

    items.push({
      name,
      price: extracted.price,
      category: currentCategory,
      available: true,
      needsReview: extracted.price === null,
      reviewReason:
        extracted.price === null
          ? "Price was not detected. Please enter the correct price."
          : "",
    });

    if (
      !categories.some(
        (category) =>
          category.toLowerCase() === currentCategory.toLowerCase()
      )
    ) {
      categories.push(currentCategory);
    }
  }

  return { categories, items };
}

router.post(
  "/scan",
  authMiddleware,
  (req, res, next) => {
    upload.array("images", 10)(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          message: error.message || "Unable to upload menu images.",
        });
      }

      next();
    });
  },
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        message: "Please upload at least one menu image.",
      });
    }

    let worker;

    try {
      worker = await createWorker("eng");

      let combinedText = "";

      for (const file of req.files) {
        const result = await worker.recognize(file.buffer);
        combinedText += "\n" + result.data.text + "\n";
      }

      const menu = parseMenuText(combinedText);

      if (menu.items.length === 0) {
        return res.status(422).json({
          message:
            "No menu items could be detected. Try a clearer, well-lit photo with readable food names and prices.",
          categories: [],
          items: [],
        });
      }

      return res.json({
        message:
          "Free OCR scan completed. Please review the extracted items and prices before saving.",
        categories: menu.categories,
        items: menu.items,
      });
    } catch (error) {
      console.error("Free menu OCR failed:", error.message);

      return res.status(500).json({
        message:
          "Menu scanning failed. Please check your internet connection for the initial OCR language download, then try again.",
      });
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {});
      }
    }
  }
);

module.exports = router;
