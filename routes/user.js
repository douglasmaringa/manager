const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const Monitor = require("../models/Monitor");
const Alert2 = require("../models/Alert2");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: The users API
 * /api/user/register:
 *   post:
 *     summary: Create a new user with email & password
 *     tags: [Users]
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

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "Email already exists" });
    }

    // Generate a random verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000);

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newUser = new User({
      email,
      password: hashedPassword,
      emailCode: verificationCode,
    });

    // Save the user to the database
    await newUser.save();
    // Send the verification code to the user's email
    // Create and save a new alert for registration
    await createAndSaveAlert(verificationCode, email, "Registration");

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});



/**
 * @swagger
 *  /api/user/verify-email:
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

    const user = await User.findOne({ email });
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
 *  /api/user/login:
 *    post:
 *      summary: User login with email and password
 *      tags: [Users]
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
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if the email has been verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Email has not been verified" });
    }

    // Check if the user is active
    if (!user.isActive) {
      return res.status(403).json({ error: "Contact Admin your account has been deactivated" });
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
 *  /api/user/login2fa/code:
 *    post:
 *      summary: Generate and send 2FA code to user's email
 *      tags: [Users]
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
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the email has been verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Email has not been verified" });
    }

    // Check if the user is active
    if (!user.isActive) {
      return res.status(403).json({ error: "Contact Admin your account has been deactivated" });
    }

    // Generate a random 6-digit 2FA code
    const twoFactorCode = Math.floor(100000 + Math.random() * 900000);

    // Update the user's twoFactorSecret and save
    user.twoFactorSecret = twoFactorCode.toString();
    await user.save();

    // Send the 2FA code to the user's email
    
    await createAndSaveAlert(twoFactorCode, email , "2FA");

    res.status(200).json({ message: "2FA code sent successfully" });
  } catch (error) {
    console.error("Error sending 2FA code:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 *  /api/user/login2fa:
 *    post:
 *      summary: User login with 2FA code
 *      tags: [Users]
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
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if the email has been verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Email has not been verified" });
    }

    // Check if the user is active
    if (!user.isActive) {
      return res.status(403).json({ error: "Contact Admin your account has been deactivated" });
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
 *  /api/user/reset-password/request:
 *    post:
 *      summary: reset password using email
 *      tags: [Users]
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
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the email has been verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Email has not been verified" });
    }

    // Check if the user is active
    if (!user.isActive) {
      return res.status(403).json({ error: "Contact Admin your account has been deactivated" });
    }

    // Generate a random 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000);

    // Update the user's resetCode and save
    user.resetCode = resetCode.toString();
    await user.save();

    // Send the reset code to the user's email
    await createAndSaveAlert(resetCode, email , "PasswordReset");

    res.status(200).json({ message: "Reset code sent successfully" });
  } catch (error) {
    console.error("Error sending reset code:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 *  /api/user/reset-password/confirm:
 *    post:
 *      summary: Confirm password reset with email, code, and new password
 *      tags: [Users]
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

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the email has been verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Email has not been verified" });
    }

    // Check if the user is active
    if (!user.isActive) {
      return res.status(403).json({ error: "Contact Admin your account has been deactivated" });
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

/**
 * @swagger
 * /api/user/delete-account/request:
 *   post:
 *     summary: Request account deletion by sending email with code
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Deletion code sent successfully
 *       404:
 *         description: User not found
 *       500:
 *         description: An internal server error occurred
 */
router.post("/delete-account/request", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the email has been verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Email has not been verified" });
    }

    // Check if the user is active
    if (!user.isActive) {
      return res.status(403).json({ error: "Contact Admin your account has been deactivated" });
    }

    // Generate a random deletion code
    const deletionCode = Math.floor(100000 + Math.random() * 900000);

    // Update the user's deletion code and save
    user.deletionCode = deletionCode.toString();
    await user.save();

    // Send the deletion code to the user's email
    await createAndSaveAlert(deletionCode, email ,"DeleteAccount");

    res.status(200).json({ message: "Deletion code sent successfully" });
  } catch (error) {
    console.error("Error sending deletion code:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/user/delete-account/confirm:
 *   post:
 *     summary: Confirm account deletion with email and code
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - deletionCode
 *             properties:
 *               email:
 *                 type: string
 *               deletionCode:
 *                 type: number
 *     responses:
 *       200:
 *         description: Account deletion successful
 *       404:
 *         description: User not found
 *       400:
 *         description: Invalid deletion code
 *       500:
 *         description: An internal server error occurred
 */
router.post("/delete-account/confirm", async (req, res) => {
  try {
    const { email, deletionCode } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the email has been verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Email has not been verified" });
    }

    // Check if the user is active
    if (!user.isActive) {
      return res.status(403).json({ error: "Contact Admin your account has been deactivated" });
    }

    if (user.deletionCode !== deletionCode) {
      return res.status(400).json({ error: "Invalid deletion code" });
    }

    // Delete all monitors belonging to the user
    await Monitor.deleteMany({ userId: user._id });

    // Delete the user account
    await user.remove();

    res.status(200).json({ message: "Account deletion successful" });
  } catch (error) {
    console.error("Error confirming account deletion:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/user/add-contact:
 *   post:
 *     summary: Add a contact to a user medium - 'email', 'sms', 'contact' value - email or phone number status - paused or active
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               medium:
 *                 type: string
 *               value:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contact added successfully
 *       404:
 *         description: User not found
 *       500:
 *         description: An internal server error occurred
 */
router.post("/add-contact", async (req, res) => {
  try {
    const { userId, medium, value } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if adding the new contact would exceed the maximum allowed contacts
    if (user?.contacts?.length >= user?.maxContacts) {
      return res.status(400).json({ error: "Maximum contacts limit reached" });
    }

    user.contacts.push({
      medium,
      value,
      status: "active",
    });

    await user.save();

    res.status(200).json({ message: "Contact added successfully", user });
  } catch (error) {
    console.error("Error adding contact:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/user/update-contact:
 *   put:
 *     summary: Update a user's contact
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               contactId:
 *                 type: string
 *               medium:
 *                 type: string
 *               value:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contact updated successfully
 *       404:
 *         description: User or contact not found
 *       500:
 *         description: An internal server error occurred
 */
router.put("/update-contact", async (req, res) => {
  try {
    const { userId, contactId, medium, value, status } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const contact = user.contacts.id(contactId);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    if (medium) contact.medium = medium;
    if (value) contact.value = value;
    if (status) contact.status = status;

    await user.save();

    res.status(200).json({ message: "Contact updated successfully", user });
  } catch (error) {
    console.error("Error updating contact:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/user/delete-contact:
 *   delete:
 *     summary: Delete a user's contact
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               contactId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contact deleted successfully
 *       404:
 *         description: User or contact not found
 *       500:
 *         description: An internal server error occurred
 */
router.delete("/delete-contact", async (req, res) => {
  try {
    const { userId, contactId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const contact = user.contacts.id(contactId);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    contact.remove();
    await user.save();

    res.status(200).json({ message: "Contact deleted successfully", user });
  } catch (error) {
    console.error("Error deleting contact:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     summary: Get user profile and associated monitors
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the user
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       404:
 *         description: User not found
 *       500:
 *         description: An internal server error occurred
 */
router.get("/profile", async (req, res) => {
  try {
    const userId = req.query.userId;

    const user = await User.findById(userId, "-password -emailCode -resetCode -deletionCode")
      .populate("monitors", "-_id -userId");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

// Function to create and save an alert
const createAndSaveAlert = async (message, email ,type) => {
  const newAlert = new Alert2({
    message,
    email,
    type
  });
  try {
    await newAlert.save();
  } catch (error) {
    console.error("Error creating alert:", error);
  }
};


module.exports = router;

