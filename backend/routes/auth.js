
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const Restaurant = require("../models/Restaurant");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const resetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const resetSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

function createToken(restaurant) {
  return jwt.sign(
    { restaurantId: restaurant._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
}

function publicRestaurant(restaurant) {
  return {
    id: restaurant._id,
    name: restaurant.name,
    email: restaurant.email,
    phone: restaurant.phone,
    address: restaurant.address,
    upiId: restaurant.upiId,
    paymentQrUrl: restaurant.paymentQrUrl,
    defaultLanguage: restaurant.defaultLanguage,
  };
}

function getTransporter() {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS ||
    !process.env.EMAIL_FROM
  ) {
    throw new Error("Email SMTP settings are missing.");
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure:
      process.env.SMTP_SECURE === "true" ||
      Number(process.env.SMTP_PORT || 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function hashCode(email, code) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${email}:${code}`)
    .digest("hex");
}

// POST /api/auth/register
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 120 ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      email.trim().length > 254 ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        message: "Enter a valid restaurant name and email, and a password of 8–128 characters.",
      });
    }

    if (
      (phone !== undefined &&
        (typeof phone !== "string" || phone.length > 30)) ||
      (address !== undefined &&
        (typeof address !== "string" || address.length > 300))
    ) {
      return res.status(400).json({
        message: "Invalid phone number or address.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await Restaurant.findOne({
      email: normalizedEmail,
    });

    if (existing) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const restaurant = await Restaurant.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      phone: phone?.trim() || "",
      address: address?.trim() || "",
    });

    return res.status(201).json({
      message: "Restaurant registered successfully.",
      token: createToken(restaurant),
      restaurant: publicRestaurant(restaurant),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    console.error("Registration error:", error.message);
    return res.status(500).json({
      message: "Registration failed. Please try again.",
    });
  }
});

// POST /api/auth/login
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 128
    ) {
      return res.status(400).json({
        message: "Enter your email and password.",
      });
    }

    const restaurant = await Restaurant.findOne({
      email: email.trim().toLowerCase(),
    }).select("+passwordHash");

    if (
      !restaurant ||
      !(await bcrypt.compare(password, restaurant.passwordHash))
    ) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    return res.json({
      message: "Login successful.",
      token: createToken(restaurant),
      restaurant: publicRestaurant(restaurant),
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      message: "Login failed. Please try again.",
    });
  }
});

// POST /api/auth/forgot-password
// Used for both the initial email request and resending a code.
router.post(
  "/forgot-password",
  resetRequestLimiter,
  async (req, res) => {
    const genericMessage =
      "If an account exists for this email, a verification code will be sent.";

    try {
      const { email } = req.body;

      if (
        typeof email !== "string" ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ) {
        return res.status(400).json({
          message: "Enter a valid email address.",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const restaurant = await Restaurant.findOne({
        email: normalizedEmail,
      });

      // Avoid revealing whether a restaurant account exists.
      if (!restaurant) {
        return res.json({ message: genericMessage });
      }

      const code = crypto.randomInt(0, 10000).toString().padStart(4, "0");
      const codeHash = hashCode(normalizedEmail, code);
      const expires = new Date(Date.now() + 5 * 60 * 1000);

      const transporter = getTransporter();

      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: normalizedEmail,
        subject: "SmartServerHub password reset code",
        text:
          `Your SmartServerHub verification code is ${code}.\n\n` +
          "It expires in 5 minutes. If you did not request this, ignore this email.",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#17231d">
            <h2>Reset your password</h2>
            <p>Use this verification code to reset your SmartServerHub password:</p>
            <div style="font-size:32px;letter-spacing:8px;font-weight:bold;padding:18px;background:#f2f7f3;text-align:center">
              ${code}
            </div>
            <p>This code expires in <strong>5 minutes</strong>.</p>
            <p>If you did not request this, you can ignore this email.</p>
          </div>
        `,
      });

      restaurant.resetCodeHash = codeHash;
      restaurant.resetCodeExpires = expires;
      await restaurant.save();

      return res.json({ message: genericMessage });
    } catch (error) {
      console.error("Password reset email error:", error.message);
      return res.status(500).json({
        message: "Unable to send the code right now. Please try again later.",
      });
    }
  }
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  resetSubmitLimiter,
  async (req, res) => {
    try {
      const { email, code, newPassword, confirmPassword } = req.body;

      if (
        typeof email !== "string" ||
        typeof code !== "string" ||
        !/^\d{4}$/.test(code) ||
        typeof newPassword !== "string" ||
        typeof confirmPassword !== "string"
      ) {
        return res.status(400).json({
          message: "Enter your email, 4-digit code, and both passwords.",
        });
      }

      if (newPassword.length < 6 || newPassword.length > 128) {
        return res.status(400).json({
          message: "Your new password must contain 6–128 characters.",
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          message: "The passwords do not match.",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const restaurant = await Restaurant.findOne({
        email: normalizedEmail,
      }).select("+resetCodeHash +resetCodeExpires");

      if (
        !restaurant ||
        !restaurant.resetCodeHash ||
        !restaurant.resetCodeExpires ||
        restaurant.resetCodeExpires.getTime() < Date.now()
      ) {
        return res.status(400).json({
          message: "The code is invalid or expired. Request a new code.",
        });
      }

      const submittedHash = hashCode(normalizedEmail, code);

      const expected = Buffer.from(restaurant.resetCodeHash, "hex");
      const submitted = Buffer.from(submittedHash, "hex");

      const matches =
        expected.length === submitted.length &&
        crypto.timingSafeEqual(expected, submitted);

      if (!matches) {
        return res.status(400).json({
          message: "Incorrect verification code.",
        });
      }

      restaurant.passwordHash = await bcrypt.hash(newPassword, 12);
      restaurant.set("resetCodeHash", undefined);
      restaurant.set("resetCodeExpires", undefined);

      await restaurant.save();

      return res.json({
        message: "Password reset successful. You can now sign in.",
      });
    } catch (error) {
      console.error("Password reset error:", error.message);
      return res.status(500).json({
        message: "Unable to reset the password right now.",
      });
    }
  }
);

router.patch("/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string"
    ) {
      return res.status(400).json({
        message: "Please fill in all password fields.",
      });
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({
        message: "The new password must be 8–128 characters.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "The new passwords do not match.",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "Choose a different password.",
      });
    }

    const restaurant = await Restaurant.findById(
      req.restaurantId
    ).select("+passwordHash");

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found.",
      });
    }

    const matches = await bcrypt.compare(
      currentPassword,
      restaurant.passwordHash
    );

    if (!matches) {
      return res.status(401).json({
        message: "Your current password is incorrect.",
      });
    }

    restaurant.passwordHash = await bcrypt.hash(newPassword, 12);
    await restaurant.save();

    res.json({
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("Change password error:", error.message);
    res.status(500).json({
      message: "Unable to change password. Please try again.",
    });
  }
});


module.exports = router;
