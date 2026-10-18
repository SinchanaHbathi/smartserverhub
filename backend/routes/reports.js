
const express = require("express");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// GET /api/reports/sales?start=2026-10-01&end=2026-10-31
router.get("/sales", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() - 29);
    defaultStart.setHours(0, 0, 0, 0);

    const start = req.query.start
      ? new Date(`${req.query.start}T00:00:00.000Z`)
      : defaultStart;

    const end = req.query.end
      ? new Date(`${req.query.end}T23:59:59.999Z`)
      : now;

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start > end
    ) {
      return res.status(400).json({
        message: "Please provide a valid date range.",
      });
    }

    const restaurantId = new mongoose.Types.ObjectId(
      req.restaurantId
    );

    const baseMatch = {
      restaurantId,
      createdAt: { $gte: start, $lte: end },
      status: { $ne: "Cancelled" },
    };

    const [summary] = await Order.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          paidOrders: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "Paid"] }, 1, 0],
            },
          },
          pendingOrders: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "Pending"] }, 1, 0],
            },
          },
          totalSales: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "Paid"] }, "$total", 0],
            },
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "Pending"] }, "$total", 0],
            },
          },
        },
      },
    ]);

    const dailySales = await Order.aggregate([
      {
        $match: {
          ...baseMatch,
          paymentStatus: "Paid",
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          sales: { $sum: "$total" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      start: start.toISOString(),
      end: end.toISOString(),
      totalOrders: summary?.totalOrders || 0,
      paidOrders: summary?.paidOrders || 0,
      pendingOrders: summary?.pendingOrders || 0,
      totalSales: summary?.totalSales || 0,
      pendingAmount: summary?.pendingAmount || 0,
      dailySales,
    });
  } catch (error) {
    console.error("Sales report error:", error.message);
    res.status(500).json({ message: "Unable to load sales report." });
  }
});

module.exports = router;
