const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const Admin = require("../models/Admin");
const UptimeEvent = require("../models/UptimeEvent");
const User = require("../models/User");
const Monitor = require("../models/Monitor");
const Alert2 = require("../models/Alert2");
const MessageTemplate = require('../models/MessageTemplate');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: The admin API
 * /api/admin/register:
 *   post:
 *     summary: Create a new admin user with email & password
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

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

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
    await createAndSaveAlert(verificationCode, email , "Registration");

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
 *      summary: Verify admin user's email using verification code
 *      tags: [Admin]
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
 * /api/admin/login2fa/code:
 *   post:
 *     summary: Send a 2FA code to admin user's email
 *     tags: [Admin]
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
 *         description: 2FA code sent successfully
 *       404:
 *         description: User not found
 *       403:
 *         description: Email has not been verified
 *       500:
 *         description: An internal server error occurred
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

    // Check if the email has been verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Email has not been verified" });
    }

    // Check if the user is an admin
    if (!user.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
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
 * /api/admin/login2fa:
 *   post:
 *     summary: Log in admin user using email, password, and 2FA code
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
 *               - twoFactorCode
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               twoFactorCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, JWT token generated
 *       401:
 *         description: Invalid email, password, or 2FA code
 *       403:
 *         description: Email has not been verified or access denied
 *       500:
 *         description: An internal server error occurred
 */
router.post("/login2fa", async (req, res) => {
  try {
    const { email, password, twoFactorCode } = req.body;

    // Check if the user exists
    const user = await Admin.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if the email has been verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Email has not been verified" });
    }

    // Check if the user is an admin
    if (!user.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
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
 * /api/admin/reset-password/request:
 *   post:
 *     summary: Send a reset code to admin user's email
 *     tags: [Admin]
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
 *         description: Reset code sent successfully
 *       404:
 *         description: User not found
 *       403:
 *         description: Email has not been verified or access denied
 *       500:
 *         description: An internal server error occurred
 */
router.post("/reset-password/request", async (req, res) => {
  try {
    const { email } = req.body;

    // Check if the user exists
    const user = await Admin.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the user is an admin
    if (!user.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }

    // Check if the email has been verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Email has not been verified" });
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
 * /api/admin/reset-password/confirm:
 *   post:
 *     summary: Confirm reset password with email, reset code, and new password
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - resetCode
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *               resetCode:
 *                 type: number
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successful
 *       404:
 *         description: User not found
 *       400:
 *         description: Invalid reset code
 *       403:
 *         description: Email has not been verified or access denied
 *       500:
 *         description: An internal server error occurred
 */
router.post("/reset-password/confirm", async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    const user = await Admin.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the email has been verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Email has not been verified" });
    }

    if (user.resetCode !== resetCode) {
      return res.status(400).json({ error: "Invalid reset code" });
    }

    // Check if the user is an admin
    if (!user.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
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
 * /api/admin/message-templates:
 *   post:
 *     summary: Create a new message template
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - type
 *               - message
 *             properties:
 *               token:
 *                 type: string
 *               type:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message template created successfully
 *       400:
 *         description: A template with the same type already exists
 *       500:
 *         description: An internal server error occurred
 */
// Create a new message template
router.post("/message-templates",verifyToken, async (req, res) => {
  try {
    const { type, message } = req.body;

    // Check if a message template with the same type already exists
    const existingTemplate = await MessageTemplate.findOne({ type });
    if (existingTemplate) {
      return res.status(409).json({ error: `A template with type '${type}' already exists` });
    }

    // Create a new message template
    const newTemplate = new MessageTemplate({
      type,
      message,
    });

    // Save the template to the database
    await newTemplate.save();

    res.status(201).json({ message: "Message template created successfully" });
  } catch (error) {
    console.error("Error creating message template:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/admin/message-templates:
 *   get:
 *     summary: get all message templates
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Message template updated successfully
 *       404:
 *         description: Message template not found
 *       500:
 *         description: An internal server error occurred
 */
// Get all message templates
router.get("/message-templates", async (req, res) => {
  try {
    const templates = await MessageTemplate.find();
    res.status(200).json(templates);
  } catch (error) {
    console.error("Error fetching message templates:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/admin/message-templates/edit:
 *   put:
 *     summary: Update a message template
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - id
 *               - type
 *               - message
 *             properties:
 *               token:
 *                 type: string
 *               id:
 *                 type: string
 *               type:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message template updated successfully
 *       404:
 *         description: Message template not found
 *       500:
 *         description: An internal server error occurred
 */
// Update a message template
router.put("/message-templates/edit",verifyToken, async (req, res) => {
  try {
    const {id, type, message } = req.body;

    // Find the template by ID
    const template = await MessageTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: "Message template not found" });
    }

    // Update the template fields
    template.type = type;
    template.message = message;

    // Save the updated template
    await template.save();

    res.status(200).json({ message: "Message template updated successfully" });
  } catch (error) {
    console.error("Error updating message template:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/admin/message-templates/delete:
 *   delete:
 *     summary: Delete a message template
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - id
 *             properties:
 *               token:
 *                 type: string
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message template deleted successfully
 *       404:
 *         description: Message template not found
 *       500:
 *         description: An internal server error occurred
 */
// Delete a message template
router.delete("/message-templates/delete",verifyToken, async (req, res) => {
  try {
    
    // Find the template by ID
    const template = await MessageTemplate.findById(req.body.id);
    if (!template) {
      return res.status(404).json({ error: "Message template not found" });
    }

    // Delete the template
    await template.remove();

    res.status(200).json({ message: "Message template deleted successfully" });
  } catch (error) {
    console.error("Error deleting message template:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/admin/user/activated:
 *   put:
 *     summary: Activate a user
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - id
 *             properties:
 *               token:
 *                 type: string
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: User activated successfully
 *       403:
 *         description: Access Denied you are not an admin
 *       404:
 *         description: User not found
 *       500:
 *         description: An internal server error occurred
 */
// Update a message template
router.put("/user/activated",verifyToken, async (req, res) => {
  const userId = req.body.id;

  try {

    const admin = await Admin.findById(req.user.userId);
    console.log(admin)

    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }
    // Find the user by ID
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update the user's isActive status to true
    user.isActive = true;
    await user.save();

    res.status(200).json({ message: 'User activated successfully' });
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

/**
 * @swagger
 * /api/admin/user/deactivate:
 *   put:
 *     summary: Deactivate a user
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - id
 *             properties:
 *               token:
 *                 type: string
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: User deactivated successfully
 *       403:
 *         description: Access Denied you are not an admin
 *       404:
 *         description: User not found
 *       500:
 *         description: An internal server error occurred
 */
// Update a message template
router.put("/user/deactivate",verifyToken, async (req, res) => {
  const userId = req.body.id;

  try {

    const admin = await Admin.findById(req.user.userId);
    
    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }
    // Find the user by ID
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update the user's isActive status to true
    user.isActive = false;
    await user.save();

    res.status(200).json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

/**
 * @swagger
 * /api/admin/all-users-monitors:
 *   post:
 *     summary: Get all users and their monitors
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: List of users and their monitors
 *       403:
 *         description: Access Denied you are not an admin
 *       500:
 *         description: An internal server error occurred
 */
// Route to get all users and their monitors
router.post('/all-users-monitors',verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);
    
    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }
    // Find all users
    const users = await User.find();

    const usersWithMonitors = [];

    // Loop through each user and populate their monitors
    for (const user of users) {
      const userWithMonitors = {
        _id: user._id,
        email: user.email,
        isActive: user.isActive,
        monitors: [],
      };

      const monitors = await Monitor.find({ user: user._id });

      // Populate monitors for the user
      userWithMonitors.monitors = monitors.map(monitor => ({
        _id: monitor._id,
        url: monitor.url,
        port: monitor.port,
        type: monitor.type,
        isPaused: monitor.isPaused,
        frequency: monitor.frequency,
        alertFrequency: monitor.alertFrequency,
        lastAlertSentAt: monitor.lastAlertSentAt,
        createdAt: monitor.createdAt,
        updatedAt: monitor.updatedAt,
      }));

      usersWithMonitors.push(userWithMonitors);
    }

    res.status(200).json(usersWithMonitors);
  } catch (error) {
    console.error('Error fetching users and monitors:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

/**
 * @swagger
 * /api/admin/edit-user-limits:
 *   put:
 *     summary: Edit maxMonitors and maxContacts for a user
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - userId
 *             properties:
 *               token:
 *                 type: string
 *               userId:
 *                 type: string
 *               maxMonitors:
 *                 type: integer
 *               maxContacts:
 *                 type: integer
 *     responses:
 *       200:
 *         description: User's limits updated successfully
 *       403:
 *         description: Access Denied you are not an admin
 *       404:
 *         description: User not found
 *       500:
 *         description: An internal server error occurred
 */
// Route to edit maxMonitors and maxContacts for a user
router.put('/edit-user-limits',verifyToken, async (req, res) => {
  const userId = req.body.userId;

  try {
    const admin = await Admin.findById(req.user.userId);
    
    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }

    // Find the user by user ID
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update maxMonitors and maxContacts if provided in the request body
    if (req.body.maxMonitors !== undefined) {
      user.maxMonitors = req.body.maxMonitors;
    }

    if (req.body.maxContacts !== undefined) {
      user.maxContacts = req.body.maxContacts;
    }

    // Save the updated user
    const updatedUser = await user.save();

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error('Error editing user limits:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
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

/**
 * @swagger
 * /api/admin/monitors:
 *   post:
 *     summary: Create a new monitor on behalf of user
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - userId
 *               - url
 *               - frequency
 *               - type
 *             properties:
 *               token:
 *                 type: string
 *               userId:
 *                 type: string
 *               url:
 *                 type: string
 *               port:
 *                 type: integer
 *               frequency:
 *                 type: integer
 *               type:
 *                 type: string
 *               alertFrequency:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Monitor created successfully
 *       400:
 *         description: Maximum monitors limit reached or other bad request
 *       403:
 *         description: Access Denied you are not an admin
 *       404:
 *         description: User not found
 *       500:
 *         description: An internal server error occurred
 */
// Create a new monitor
router.post("/monitors", verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);
    
    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }

    const { url,port,frequency,type,alertFrequency } = req.body;

    // Extract user ID from the token
    const userId = req.body.userId;
    const port2 =  port || 443;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

     // Find all monitors belonging to the user
     const monitors = await Monitor.find({ user: userId });
     
    // Check if the user has reached their maximum monitors limit
    if (monitors?.length >= user?.maxMonitors) {
      return res.status(400).json({ error: 'Maximum monitors limit reached' });
    }

    // Create a new monitor for the user
    const newMonitor = new Monitor({
      user: userId,
      url,
      type,
      isPaused: false,
      port:port2,
      frequency,
      alertFrequency:alertFrequency || 1
    });

    // Save the monitor to the database
    await newMonitor.save();

    res.status(201).json({ message: "Monitor created successfully" });
  } catch (error) {
    console.error("Error creating monitor:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/admin/monitors/pause:
 *   put:
 *     summary: Update a monitor and set isPaused to true
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - id
 *             properties:
 *               token:
 *                 type: string
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Monitor paused successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access Denied you are not an admin
 *       404:
 *         description: Monitor not found
 *       500:
 *         description: An internal server error occurred
 */
// Update a monitor and set isPaused to true
router.put("/monitors/pause", verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);
    
    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }

    const monitorId = req.body.id;
    // Find the monitor and ensure it belongs to the user
    const monitor = await Monitor.findOne({ _id: monitorId });
    if (!monitor) {
      return res.status(404).json({ error: "Monitor not found" });
    }

    // Update the monitor and set isPaused to true
    monitor.isPaused = !monitor.isPaused;
    await monitor.save();

    res.status(200).json({ message: "Monitor paused successfully" });
  } catch (error) {
    console.error("Error pausing monitor:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});
/**
 * @swagger
 * /api/admin/monitors/remove:
 *   delete:
 *     summary: Delete a monitor
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - monitorId
 *             properties:
 *               token:
 *                 type: string
 *               monitorId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Monitor deleted successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access Denied you are not an admin
 *       404:
 *         description: Monitor not found
 *       500:
 *         description: An internal server error occurred
 */
// Delete a monitor
router.delete("/monitors/remove",verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);
    
    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }

    const monitorId = req.body.monitorId;
   
    // Find the monitor and ensure it belongs to the user
    const monitor = await Monitor.findOne({ _id: monitorId});
    if (!monitor) {
      return res.status(404).json({ error: "Monitor not found" });
    }

    // Delete the monitor and its associated events
    await monitor.remove();
    await UptimeEvent.deleteMany({ monitor: monitorId });

    res.status(200).json({ message: "Monitor deleted successfully" });
  } catch (error) {
    console.error("Error deleting monitor:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});




// Middleware function to verify the JWT token
function verifyToken(req, res, next) {
  const token = req.body.token;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  jwt.verify(token, "secret", (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = decoded;
    next();
  });
}



module.exports = router;

