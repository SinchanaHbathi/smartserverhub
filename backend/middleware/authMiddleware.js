
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

function authMiddleware(req, res, next) {
  const authorization = req.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      message: "Please log in to continue.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const restaurantId = decoded.restaurantId;

    if (!mongoose.isValidObjectId(restaurantId)) {
      return res.status(401).json({
        message: "Invalid login session.",
      });
    }

    req.restaurantId = restaurantId;
    next();
  } catch {
    return res.status(401).json({
      message: "Your session has expired. Please log in again.",
    });
  }
}

module.exports = authMiddleware;
