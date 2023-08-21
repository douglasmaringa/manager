const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const Admin = require("../models/Admin");
const Monitor = require("../models/Monitor");
const Alert2 = require("../models/Alert2");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: The Admin API
 * /api/admin/register:
 *   post:
 *     summary: Create a new user with email & password
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       409:
 *         description: Email already exists
 *       500:
 *         description: An internal server error occurred
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if email already exists
    const existingUser = await Admin.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "Email already exists" });
    }

    // Generate a random verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000);

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newUser = new Admin({
      email,
      password: hashedPassword,
      emailCode: verificationCode,
    });

    // Save the user to the database
    await newUser.save();
    // Send the verification code to the user's email
    // Create and save a new alert for registration
    await createAndSaveAlert(`email verification code ${verificationCode}`, email);

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});



/**
 * @swagger
 *  /api/admin/verify-email:
 *    post:
 *      summary: Verify user's email using verification code
 *      tags: [Users]
 *      requestBody:
 *        required: true
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              required:
 *                - email
 *                - verificationCode
 *              properties:
 *                email:
 *                  type: string
 *                verificationCode:
 *                  type: number
 *      responses:
 *        200:
 *          description: Email verified successfully
 *        404:
 *          description: User not found
 *        400:
 *          description: Invalid verification code
 *        500:
 *          description: An internal server error occurred
 */

router.post("/verify-email", async (req, res) => {
  try {
    const { email, verificationCode } = req.body;

    const user = await Admin.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.emailCode !== verificationCode) {
      return res.status(400).json({ error: "Invalid verification code" });
    }

    // Update user's email verification status
    user.isEmailVerified = true;
    await user.save();

    res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Error verifying email:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 *  /api/admin/login:
 *    post:
 *      summary: User login with email and password
 *      tags: [Admin]
 *      requestBody:
 *        required: true
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              required:
 *                - email
 *                - password
 *              properties:
 *                email:
 *                  type: string
 *                password:
 *                  type: string
 *      responses:
 *        200:
 *          description: User logged in successfully
 *        401:
 *          description: Invalid email or password
 *        429:
 *          description: Account locked due to too many failed attempts
 *        500:
 *          description: An internal server error occurred
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if the user exists
    const user = await Admin.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if the account is locked due to too many failed attempts
    if (user.failedLoginAttempts >= 3 && user.lastFailedLoginAt) {
      const lockoutDuration = 5 * 60 * 1000; // 5 minutes in milliseconds
      const lockoutEndTime = new Date(user.lastFailedLoginAt.getTime() + lockoutDuration);

      if (lockoutEndTime > new Date()) {
        return res.status(429).json({ error: "Account locked due to too many failed attempts" });
      }
    }

    // Check if the password is correct
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // Update failed login attempts and timestamp
      user.failedLoginAttempts += 1;
      user.lastFailedLoginAt = new Date();
      await user.save();

      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Reset failed login attempts upon successful login
    user.failedLoginAttempts = 0;
    user.lastFailedLoginAt = null;
    await user.save();

    // Generate a JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      "secret",
      { expiresIn: "10h" }
    );

    res.status(200).json({ token, userId: user._id });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 *  /api/admin/login2fa/code:
 *    post:
 *      summary: Generate and send 2FA code to user's email
 *      tags: [Admin]
 *      requestBody:
 *        required: true
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              required:
 *                - email
 *              properties:
 *                email:
 *                  type: string
 *      responses:
 *        200:
 *          description: 2FA code sent successfully
 *        404:
 *          description: User not found
 *        500:
 *          description: An internal server error occurred
 */
// User login with 2FA
router.post("/login2fa/code", async (req, res) => {
  try {
    const { email } = req.body;

    // Check if the user exists
    const user = await Admin.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate a random 6-digit 2FA code
    const twoFactorCode = Math.floor(100000 + Math.random() * 900000);

    // Update the user's twoFactorSecret and save
    user.twoFactorSecret = twoFactorCode.toString();
    await user.save();

    // Send the 2FA code to the user's email
    
    await createAndSaveAlert(`your login code ${twoFactorCode}`, email);

    res.status(200).json({ message: "2FA code sent successfully" });
  } catch (error) {
    console.error("Error sending 2FA code:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 *  /api/admin/login2fa:
 *    post:
 *      summary: User login with 2FA code
 *      tags: [Admin]
 *      requestBody:
 *        required: true
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              required:
 *                - email
 *                - password
 *                - twoFactorCode
 *              properties:
 *                email:
 *                  type: string
 *                password:
 *                  type: string
 *                twoFactorCode:
 *                  type: string
 *      responses:
 *        200:
 *          description: User logged in successfully
 *        401:
 *          description: Invalid email, password, or 2FA code
 *        500:
 *          description: An internal server error occurred
 */
router.post("/login2fa", async (req, res) => {
  try {
    const { email, password, twoFactorCode } = req.body;

    // Check if the user exists
    const user = await Admin.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if the password is correct
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if the provided 2FA code matches
    if (user.twoFactorSecret !== twoFactorCode) {
      return res.status(401).json({ error: "Invalid 2FA code" });
    }

    // Clear the twoFactorSecret after successful login
    user.twoFactorSecret = null;
    await user.save();

    // Generate a JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      "secret",
      { expiresIn: "10h" }
    );
    res.status(200).json({ token, userId: user._id });
  } catch (error) {
    console.error("Error logging in with 2FA:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 *  /api/admin/reset-password/request:
 *    post:
 *      summary: reset password using email
 *      tags: [Admin]
 *      requestBody:
 *        required: true
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              required:
 *                - email
 *              properties:
 *                email:
 *                  type: string
 *      responses:
 *        200:
 *          description: password reset code sent successfully
 *        401:
 *          description: Invalid email.
 *        500:
 *          description: An internal server error occurred
 */
router.post("/reset-password/request", async (req, res) => {
  try {
    const { email } = req.body;

    // Check if the user exists
    const user = await Admin.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate a random 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000);

    // Update the user's resetCode and save
    user.resetCode = resetCode.toString();
    await user.save();

    // Send the reset code to the user's email
    await createAndSaveAlert(`your reset code ${resetCode}`, email);

    res.status(200).json({ message: "Reset code sent successfully" });
  } catch (error) {
    console.error("Error sending reset code:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 *  /api/admin/reset-password/confirm:
 *    post:
 *      summary: Confirm password reset with email, code, and new password
 *      tags: [Admin]
 *      requestBody:
 *        required: true
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              required:
 *                - email
 *                - resetCode
 *                - newPassword
 *              properties:
 *                email:
 *                  type: string
 *                resetCode:
 *                  type: number
 *                newPassword:
 *                  type: string
 *      responses:
 *        200:
 *          description: Password reset successful
 *        404:
 *          description: User not found
 *        400:
 *          description: Invalid reset code
 *        500:
 *          description: An internal server error occurred
 */
router.post("/reset-password/confirm", async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    const user = await Admin.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.resetCode !== resetCode) {
      return res.status(400).json({ error: "Invalid reset code" });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password and resetCode
    user.password = hashedPassword;
    user.resetCode = null;
    await user.save();

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});


// Function to create and save an alert
const createAndSaveAlert = async (message, email) => {
  const newAlert = new Alert2({
    message,
    email,
  });
  try {
    await newAlert.save();
  } catch (error) {
    console.error("Error creating alert:", error);
  }
};


module.exports = router;

