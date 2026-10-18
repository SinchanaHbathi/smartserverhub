
const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    tableNumber: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { timestamps: true }
);

tableSchema.index(
  { restaurantId: 1, tableNumber: 1 },
  { unique: true }
);

module.exports = mongoose.model("Table", tableSchema);
