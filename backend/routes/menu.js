
const express = require("express");
const mongoose = require("mongoose");
const Menu = require("../models/Menu");
const authMiddleware = require("../middleware/authMiddleware");
const Restaurant = require("../models/Restaurant");

const router = express.Router();

router.use(authMiddleware);

/*
 * PUBLIC CUSTOMER MENU
 * GET /api/menu/customer/:restaurantId
 *
 * No customer login required.
 * Returns only the published menu and available food items.
 */
router.get("/customer/:restaurantId", async (req, res) => {
  try {
    const { restaurantId } = req.params;

    if (!mongoose.isValidObjectId(restaurantId)) {
      return res.status(400).json({
        message: "Invalid restaurant QR code.",
      });
    }

    const [restaurant, menu] = await Promise.all([
      Restaurant.findById(restaurantId)
        .select("_id restaurantName")
        .lean(),

      Menu.findOne({ restaurantId })
        .select("restaurantId categories items")
        .lean(),
    ]);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found.",
      });
    }

    if (!menu) {
      return res.status(404).json({
        message: "This restaurant has not published a menu yet.",
        restaurantName: restaurant.restaurantName,
      });
    }

    const availableItems = (menu.items || [])
      .filter((item) => item.available !== false)
      .map((item) => ({
        _id: item._id,
        name: item.name,
        price: item.price,
        category: item.category || "Other",
        available: true,
      }));

    const categories = [
      ...new Set([
        ...(menu.categories || []),
        ...availableItems.map((item) => item.category),
      ]),
    ];

    return res.json({
      restaurantId: String(restaurant._id),
      restaurantName: restaurant.restaurantName,
      categories,
      items: availableItems,
    });
  } catch (error) {
    console.error("Public customer menu error:", error);

    return res.status(500).json({
      message: "Unable to load this restaurant's menu.",
    });
  }
});


function cleanCategories(categories = []) {
  if (!Array.isArray(categories)) {
    throw new Error("Categories must be an array.");
  }

  return [
    ...new Set(
      categories.map((category) => {
        if (typeof category !== "string" || !category.trim()) {
          throw new Error("Every category must have a name.");
        }

        if (category.trim().length > 100) {
          throw new Error(
            "Category names must be 100 characters or fewer."
          );
        }

        return category.trim();
      })
    ),
  ];
}

function cleanItems(items = []) {
  if (!Array.isArray(items)) {
    throw new Error("Items must be an array.");
  }

  return items.map((item) => {
    if (
      !item ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.trim().length > 150 ||
      typeof item.category !== "string" ||
      !item.category.trim() ||
      item.category.trim().length > 100 ||
      item.price === "" ||
      item.price === null ||
      item.price === undefined ||
      !Number.isFinite(Number(item.price)) ||
      Number(item.price) < 0 ||
      (item.available !== undefined &&
        typeof item.available !== "boolean")
    ) {
      throw new Error(
        "Each item needs a valid name, category, and non-negative price."
      );
    }

    return {
      name: item.name.trim(),
      category: item.category.trim(),
      price: Number(item.price),
      available: item.available !== false,
    };
  });
}

function combineCategories(categories, items) {
  return [
    ...new Set([
      ...categories,
      ...items.map((item) => item.category),
    ]),
  ];
}

// GET /api/menu
router.get("/", async (req, res) => {
  try {
    const menu = await Menu.findOne({
      restaurantId: req.restaurantId,
    }).lean();

    if (!menu) {
      return res.json({
        restaurantId: req.restaurantId,
        categories: [],
        items: [],
        manualCategories: [],
        manualItems: [],
        uploadedCategories: [],
        uploadedItems: [],
        publishMode: "manual",
      });
    }

    // Backward compatibility: existing menus may only have
    // the old categories/items fields.
    const manualItems =
      menu.manualItems?.length > 0
        ? menu.manualItems
        : menu.uploadedItems?.length > 0
          ? []
          : menu.items || [];

    const manualCategories =
      menu.manualCategories?.length > 0
        ? menu.manualCategories
        : menu.uploadedItems?.length > 0
          ? []
          : menu.categories || [];

    return res.json({
      ...menu,
      manualCategories,
      manualItems,
      uploadedCategories: menu.uploadedCategories || [],
      uploadedItems: menu.uploadedItems || [],
      publishMode: menu.publishMode || "manual",
    });
  } catch (error) {
    console.error("Load menu error:", error.message);
    return res.status(500).json({
      message: "Unable to load menu.",
    });
  }
});

// PUT /api/menu
router.put("/", async (req, res) => {
  try {
    const {
      categories,
      items,
      manualCategories,
      manualItems,
      uploadedCategories,
      uploadedItems,
      publishMode,
    } = req.body;

    const usesSeparateMenus =
      manualCategories !== undefined ||
      manualItems !== undefined ||
      uploadedCategories !== undefined ||
      uploadedItems !== undefined ||
      publishMode !== undefined;

    let update;

    if (usesSeparateMenus) {
      if (!["both", "manual", "uploaded"].includes(publishMode)) {
        return res.status(400).json({
          message: "Choose both, manual, or uploaded as the save option.",
        });
      }

      const safeManualItems = cleanItems(manualItems || []);
      const safeManualCategories = combineCategories(
        cleanCategories(manualCategories || []),
        safeManualItems
      );

      const safeUploadedItems = cleanItems(uploadedItems || []);
      const safeUploadedCategories = combineCategories(
        cleanCategories(uploadedCategories || []),
        safeUploadedItems
      );

      let activeItems = [];
      let activeCategories = [];

      if (publishMode === "manual") {
        activeItems = safeManualItems;
        activeCategories = safeManualCategories;
      } else if (publishMode === "uploaded") {
        activeItems = safeUploadedItems;
        activeCategories = safeUploadedCategories;
      } else {
        activeItems = [...safeManualItems, ...safeUploadedItems];
        activeCategories = combineCategories(
          [...safeManualCategories, ...safeUploadedCategories],
          activeItems
        );
      }

      if (activeItems.length === 0) {
        return res.status(400).json({
          message: "The selected menu has no food items to publish.",
        });
      }

      update = {
        $set: {
          manualCategories: safeManualCategories,
          manualItems: safeManualItems,
          uploadedCategories: safeUploadedCategories,
          uploadedItems: safeUploadedItems,
          categories: activeCategories,
          items: activeItems,
          publishMode,
        },
        $setOnInsert: {
          restaurantId: new mongoose.Types.ObjectId(req.restaurantId),
        },
      };
    } else {
      // Backward compatibility for existing frontend requests.
      const safeItems = cleanItems(items || []);
      const safeCategories = combineCategories(
        cleanCategories(categories || []),
        safeItems
      );

      update = {
        $set: {
          categories: safeCategories,
          items: safeItems,
          manualCategories: safeCategories,
          manualItems: safeItems,
          publishMode: "manual",
        },
        $setOnInsert: {
          restaurantId: new mongoose.Types.ObjectId(req.restaurantId),
        },
      };
    }

    const menu = await Menu.findOneAndUpdate(
      { restaurantId: req.restaurantId },
      update,
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.json({
      message: "Menu saved successfully.",
      menu,
    });
  } catch (error) {
    if (
      error.message.startsWith("Every ") ||
      error.message.startsWith("Category ") ||
      error.message.startsWith("Each item")
    ) {
      return res.status(400).json({
        message: error.message,
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Menu already exists. Please retry.",
      });
    }

    console.error("Save menu error:", error.message);
    return res.status(500).json({
      message: "Unable to save menu.",
    });
  }
});

module.exports = router;
