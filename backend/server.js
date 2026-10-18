
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const menuRoutes = require("./routes/menu");
const tableRoutes = require("./routes/tables");
const aiMenuRoutes = require("./routes/aiMenu");
const orderRoutes = require("./routes/orders");
const settingsRoutes = require("./routes/settings");
const reportsRoutes = require("./routes/reports");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20kb" }));

app.get("/", (req, res) => {
  res.json({
    message: "SmartServerHub backend is running!",
  });
});

app.use("/api/auth", authRoutes);
app.get("/api/settings-test", (req, res) => {
  res.json({ message: "Settings test route is working!" });
});
app.use("/api/settings", settingsRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/menu", aiMenuRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reports", reportsRoutes);

async function startServer() {
  try {
    if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
      throw new Error(
        "MONGODB_URI and JWT_SECRET must be configured in .env"
      );
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("MongoDB Atlas connected successfully!");

    const port = process.env.PORT || 5000;

    app.listen(port, () => {
      console.log(
        `SmartServerHub backend running at http://localhost:${port}`
      );
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
