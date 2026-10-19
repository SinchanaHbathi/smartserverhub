
const express = require("express");
const mongoose = require("mongoose");
const Menu = require("../models/Menu");
const Restaurant = require("../models/Restaurant");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| PUBLIC CUSTOMER MENU
|--------------------------------------------------------------------------
| GET /api/menu/customer/:restaurantId
| Customers scanning a table QR do NOT need to log in.
*/
router.get("/customer/:restaurantId", async (req, res) => {
  try {
    const { restaurantId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        message: "Invalid restaurant ID.",
      });
    }

    const restaurant = await Restaurant.findById(restaurantId).select(
      "restaurantName name"
    );

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found.",
      });
    }

    const menu = await Menu.findOne({ restaurantId }).lean();

    if (!menu) {
      return res.status(404).json({
        message: "Menu not found for this restaurant.",
        restaurantId,
        restaurantName:
          restaurant.restaurantName || restaurant.name || "Restaurant",
        categories: [],
        items: [],
      });
    }

    // Return only food items marked available.
    const items = Array.isArray(menu.items)
      ? menu.items.filter((item) => item.available !== false)
      : [];

    return res.status(200).json({
      restaurantId,
      restaurantName:
        restaurant.restaurantName || restaurant.name || "Restaurant",
      categories: Array.isArray(menu.categories) ? menu.categories : [],
      items,
    });
  } catch (error) {
    console.error("Public customer menu error:", error);

    return res.status(500).json({
      message: "Unable to load the customer menu.",
    });
  }
});

/*
|--------------------------------------------------------------------------
| PROTECT MANAGER ROUTES ONLY
|--------------------------------------------------------------------------
| IMPORTANT: This middleware must stay AFTER the public customer route.
*/
router.use(authMiddleware);

/*
|--------------------------------------------------------------------------
| GET MANAGER MENU
|--------------------------------------------------------------------------
| GET /api/menu
| Requires manager authentication.
*/
router.get("/", async (req, res) => {
  try {
    const restaurantId = req.restaurantId;

    if (!restaurantId) {
      return res.status(401).json({
        message: "Restaurant login required.",
      });
    }

    const menu = await Menu.findOne({ restaurantId }).lean();

    if (!menu) {
      return res.status(200).json({
        restaurantId,
        categories: [],
        items: [],
      });
    }

    return res.status(200).json(menu);
  } catch (error) {
    console.error("Get manager menu error:", error);

    return res.status(500).json({
      message: "Unable to load the menu.",
    });
  }
});

/*
|--------------------------------------------------------------------------
| SAVE MANAGER MENU
|--------------------------------------------------------------------------
| PUT /api/menu
| Requires manager authentication.
*/
router.put("/", async (req, res) => {
  try {
    const restaurantId = req.restaurantId;

    if (!restaurantId) {
      return res.status(401).json({
        message: "Restaurant login required.",
      });
    }

    const { categories, items } = req.body;

    if (
      categories !== undefined &&
      !Array.isArray(categories)
    ) {
      return res.status(400).json({
        message: "Categories must be an array.",
      });
    }

    if (items !== undefined && !Array.isArray(items)) {
      return res.status(400).json({
        message: "Items must be an array.",
      });
    }

    const update = {};

    if (categories !== undefined) {
      update.categories = categories;
    }

    if (items !== undefined) {
      update.items = items;
    }

    const savedMenu = await Menu.findOneAndUpdate(
      { restaurantId },
      {
        $set: update,
        $setOnInsert: { restaurantId },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      message: "Menu saved successfully.",
      menu: savedMenu,
    });
  } catch (error) {
    console.error("Save manager menu error:", error);

    return res.status(500).json({
      message: "Unable to save the menu.",
      error: error.message,
    });
  }
});

module.exports = router;
