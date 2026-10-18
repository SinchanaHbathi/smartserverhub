
const express = require("express");
const Table = require("../models/Table");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

function getCustomerMenuUrl(req, tableNumber) {
  const frontendUrl = (
    process.env.FRONTEND_URL || "http://localhost:5173"
  ).replace(/\/+$/, "");

  const url = new URL("/customer-menu", frontendUrl);

  url.searchParams.set("restaurantId", req.restaurantId.toString());
  url.searchParams.set("table", String(tableNumber));

  return url.toString();
}

// GET /api/tables
router.get("/", async (req, res) => {
  try {
    const savedTables = await Table.find({
      restaurantId: req.restaurantId,
    })
      .sort({ tableNumber: 1 })
      .lean();

    const tables = savedTables.map((table) => ({
      id: table._id,
      tableNumber: table.tableNumber,
      qrUrl: getCustomerMenuUrl(req, table.tableNumber),
    }));

    return res.json({ tables });
  } catch (error) {
    console.error("Load tables error:", error.message);
    return res.status(500).json({
      message: "Unable to load tables.",
    });
  }
});

// POST /api/tables
// Body: { "count": 10 }
router.post("/", async (req, res) => {
  try {
    const count = Number(req.body.count);

    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 200
    ) {
      return res.status(400).json({
        message: "Table count must be a whole number between 1 and 200.",
      });
    }

    const existingTables = await Table.find({
      restaurantId: req.restaurantId,
    })
      .select("tableNumber")
      .lean();

    const existingNumbers = new Set(
      existingTables.map((table) => table.tableNumber)
    );

    const newTables = [];

    for (let number = 1; number <= count; number++) {
      if (!existingNumbers.has(number)) {
        newTables.push({
          restaurantId: req.restaurantId,
          tableNumber: number,
        });
      }
    }

    if (newTables.length > 0) {
      await Table.insertMany(newTables, { ordered: false });
    }

    const savedTables = await Table.find({
      restaurantId: req.restaurantId,
    })
      .sort({ tableNumber: 1 })
      .lean();

    return res.json({
      message: "Tables saved successfully.",
      tables: savedTables.map((table) => ({
        id: table._id,
        tableNumber: table.tableNumber,
        qrUrl: getCustomerMenuUrl(req, table.tableNumber),
      })),
    });
  } catch (error) {
    console.error("Save tables error:", error.message);
    return res.status(500).json({
      message: "Unable to save tables.",
    });
  }
});

module.exports = router;
