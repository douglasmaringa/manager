const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const Admin = require("../models/Admin");
const UptimeEvent = require("../models/UptimeEvent");
const IpAddress = require('../models/IpAddress');
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

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
    console.log(clientIpAddress)
    // Check if the client's IP address exists in the database
    
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

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

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
    //console.log(clientIpAddress)
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

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

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
    //console.log(clientIpAddress)
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

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

    // Check if the email has been verified
    if (!user.isActive) {
      return res.status(403).json({ error: "Admin has not activated this account" });
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

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
    //console.log(clientIpAddress)
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    // Check if the user exists
    const user = await Admin.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if the email has been verified
    if (!user.isActive) {
      return res.status(403).json({ error: "Admin has not activated this account" });
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

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
    //console.log(clientIpAddress)
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    // Check if the user exists
    const user = await Admin.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the email has been verified
    if (!user.isActive) {
      return res.status(403).json({ error: "Admin has not activated this account" });
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

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
    //console.log(clientIpAddress)
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    const user = await Admin.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the email has been verified
    if (!user.isActive) {
      return res.status(403).json({ error: "Admin has not activated this account" });
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
 *     summary: Create a new message template type can be (Up,Down,Registration, 2FA, PasswordReset, DeleteAccount, UserDeletion)
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
router.post("/message-templates", async (req, res) => {
  try {
    const { type, message,from,subject } = req.body;

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
   
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });
   
    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    // Check if a message template with the same type already exists
    const existingTemplate = await MessageTemplate.findOne({ type });
    if (existingTemplate) {
      return res.status(409).json({ error: `A template with type '${type}' already exists` });
    }

    // Validate if the message contains the {{error}} placeholder
    if (!message.includes("{{variable}}")) {
      return res.status(400).json({ error: 'The message must contain the {{variable}} placeholder' });
    }

    // Create a new message template
    const newTemplate = new MessageTemplate({
      type,
      message,
      from,
      subject
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
 * /api/admin/activate:
 *   put:
 *     summary: Activate an admin user with a valid token and admin user ID
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - adminId
 *             properties:
 *               token:
 *                 type: string
 *               adminId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Admin user activated successfully
 *       400:
 *         description: Invalid request - Missing token or adminId
 *       401:
 *         description: Unauthorized - Invalid token
 *       404:
 *         description: Admin not found
 *       500:
 *         description: An internal server error occurred
 */
router.put("/activate", verifyToken, async (req, res) => {
  try {
    const { adminId } = req.body;

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
    //console.log(clientIpAddress)
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    if (!adminId) {
      return res.status(400).json({ error: "Invalid request - Missing adminId" });
    }

    // Update the isActive field to true for the admin with the given ID
    const updatedAdmin = await Admin.findByIdAndUpdate(adminId, { isActive: true }, { new: true });

    if (!updatedAdmin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    res.status(200).json({ message: "Admin user activated successfully" });
  } catch (error) {
    console.error("Error activating admin:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});


/**
 * @swagger
 * /api/admin/fetchmessage-templates:
 *   post:
 *     summary: Get message templates with pagination and optional type search
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - page
 *             properties:
 *               token:
 *                 type: string
 *               page:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *               search:
 *                 type: string
 *                 description: Type search filter (optional)
 *                 example: "Up"
 *     responses:
 *       200:
 *         description: Message templates fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 templates:
 *                   type: array
 *                   description: List of message templates on the current page
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *       404:
 *         description: Message templates not found
 *       500:
 *         description: An internal server error occurred
 */
// Get message templates with pagination and optional type search
router.post("/fetchmessage-templates", verifyToken, async (req, res) => {
  try {
    // Extract the page number and search parameter from the request body
    const { page, search } = req.body;

    // Define the page size (number of message templates per page)
    const pageSize = 10; // Set your desired page size

    let query = {}; // Initialize an empty query object

    // If a search term is provided, filter by type
    if (search) {
      query.type = search; // Filter by the provided type
    }

    // Count the total number of message templates that match the query
    const totalTemplates = await MessageTemplate.countDocuments(query);

    // Calculate the total pages
    const totalPages = Math.ceil(totalTemplates / pageSize);

    // Calculate the skip value based on the page number
    const skip = (page - 1) * pageSize;

    // Fetch message templates with pagination and the search query
    const templates = await MessageTemplate.find(query)
      .skip(skip)
      .limit(pageSize);

    res.status(200).json({ templates, totalPages ,totalTemplates});
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
    const {id, type, message,from,subject } = req.body;
    console.log(subject)

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
   
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });
   
    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    // Validate if the message contains the {{error}} placeholder
    if (!message.includes("{{variable}}")) {
      return res.status(400).json({ error: 'The message must contain the {{variable}} placeholder' });
    }


    // Find the template by ID
    const template = await MessageTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: "Message template not found" });
    }

    // Update the template fields
    template.type = type;
    template.message = message;
    template.from = from;
    template.subject = subject;

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

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
   
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });
   
    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    
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
 *     summary: Activate a user account after deactivating
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

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
   
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });
   
    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }


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
    const clientIpAddress = req?.ip; // Get the client's IP address from the request
   
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });
   
    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }


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
 * /api/admin/all-users:
 *   post:
 *     summary: Get all users with pagination and optional search by email
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - page
 *             properties:
 *               token:
 *                 type: string
 *               page:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *               search:
 *                 type: string
 *                 description: Search term to filter users by email (optional)
 *     responses:
 *       200:
 *         description: List of users on the current page
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   description: List of users on the current page
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *       403:
 *         description: Access Denied you are not an admin
 *       500:
 *         description: An internal server error occurred
 */
router.post('/all-users', verifyToken, async (req, res) => {
  try {
    const clientIpAddress = req?.ip; // Get the client's IP address from the request

    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    const admin = await Admin.findById(req.user.userId);

    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: 'Access Denied you are not an admin' });
    }

    // Extract the page number and search term (if provided) from the request body
    const { page, search } = req.body;

    // Define the page size (number of users per page)
    const pageSize = 10; // Set your desired page size

    // Construct the query to search users by email if a search term is provided
    const userQuery = search ? { email: { $regex: search, $options: 'i' } } : {};

    // Count the total number of users based on the search query
    const totalUsers = await User.countDocuments(userQuery);

    // Calculate the total pages
    const totalPages = Math.ceil(totalUsers / pageSize);

    // Calculate the skip value based on the page number
    const skip = (page - 1) * pageSize;

    // Modify the query to exclude the 'password' field
    const users = await User.find(userQuery)
      .select('-password') // Exclude the 'password' field
      .skip(skip)
      .limit(pageSize);

    res.status(200).json({ users, totalPages ,totalUsers});
  } catch (error) {
    console.error('Error fetching users and monitors:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});


router.put('/edit-user', verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);

    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: 'Access Denied you are not an admin' });
    }

    // Extract user data from the request body
    const { id,isEmailVerified,isTwoFactorEnabled,maxMonitors,maxContacts,isActive,email,password } = req.body;

    
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user properties if provided
    if (isEmailVerified) {
      user.isEmailVerified = isEmailVerified;
    }
    if (isTwoFactorEnabled) {
      user.isTwoFactorEnabled = isTwoFactorEnabled;
    }

    if (maxMonitors) {
      user.maxMonitors = maxMonitors;
    }
    if (maxContacts) {
      user.maxContacts = maxContacts;
    }

    if (isActive) {
      user.isActive = isActive;
    }

    if (email) {
      user.email = email;
    }

    if (password) {
      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update the user's password
      user.password = hashedPassword;
    }

    // Save the updated user
    await user.save();

    res.status(200).json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating the user:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

router.post('/create-user', verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);

    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: 'Access Denied you are not an admin' });
    }
   

    // Extract user data from the request body
    const { email, password,isEmailVerified,emailCode,isTwoFactorEnabled,twoFactorSecret,failedLoginAttempts,lastFailedLoginAt,resetCode,deletionCode,isAdmin,isActive,maxContacts,maxMonitors } = req.body;

    // Create a new user
    const user = new User({
      email,
      password,
      isEmailVerified,
      emailCode,
      isTwoFactorEnabled,
      twoFactorSecret,
      failedLoginAttempts,
      lastFailedLoginAt,
      resetCode,
      deletionCode,
      isAdmin,
      isActive,
      maxContacts,
      maxMonitors

      // Add other user properties as needed
    });

    // Save the user to the database
    await user.save();

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Error creating a new user:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});


/**
 * @swagger
 * /api/admin/user-monitors:
 *   post:
 *     summary: Get monitors for a specific user with pagination and search leave search plank to return all monitors for the user
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
 *                 description: ID of the user whose monitors to retrieve
 *               page:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *               search:
 *                 type: string
 *                 description: Search term to filter monitors (optional)
 *     responses:
 *       200:
 *         description: List of monitors belonging to the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 monitors:
 *                   type: array
 *                   description: List of monitors belonging to the user
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *       403:
 *         description: Access Denied you are not an admin
 *       500:
 *         description: An internal server error occurred
 */
router.post('/user-monitors', verifyToken, async (req, res) => {
  try {
    const clientIpAddress = req?.ip; // Get the client's IP address from the request

    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    const admin = await Admin.findById(req.user.userId);

    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: 'Access Denied you are not an admin' });
    }

    const { userId, page, search } = req.body;

    // Define the page size (number of monitors per page)
    const pageSize = 10; // Set your desired page size
    const skip = (page - 1) * pageSize;

    let monitorQuery = { user: userId };

    if (search) {
      // If a search term is provided, filter monitors by the search term
      monitorQuery = {
        ...monitorQuery,
       
          name: { $regex: search, $options: 'i' }, // Case-insensitive URL 
      };
    }

    // Count the total number of monitors for the user (with optional search)
    const totalMonitors = await Monitor.countDocuments(monitorQuery);

    // Calculate the total pages
    const totalPages = Math.ceil(totalMonitors / pageSize);

    // Find monitors for the specified user (with optional search)
    const monitors = await Monitor.find(monitorQuery)
      .skip(skip)
      .limit(pageSize);

    res.status(200).json({ monitors, totalPages,totalMonitors });
  } catch (error) {
    console.error('Error fetching monitors for the user:', error);
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
    const clientIpAddress = req?.ip; // Get the client's IP address from the request
   
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });
   
    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

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
    const clientIpAddress = req?.ip; // Get the client's IP address from the request
   
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });
   
    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    const admin = await Admin.findById(req.user.userId);
    
    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }

    const { name,url,port,frequency,type,alertFrequency } = req.body;

    // Extract user ID from the token
    const userId = req.body.user;
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
      name,
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
 * /api/admin/monitors/edit:
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
router.put("/monitors/edit", verifyToken, async (req, res) => {
  try {
    const clientIpAddress = req?.ip; // Get the client's IP address from the request
   
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });
   
    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    const admin = await Admin.findById(req.user.userId);
    
    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }
    
    const {id, name,user, url, type, isPaused, port, frequency, alertFrequency } = req.body;
    
    // Find the monitor and ensure it belongs to the user
    const monitor = await Monitor.findOne({ _id: id });
    if (!monitor) {
      return res.status(404).json({ error: "Monitor not found" });
    }

    

    monitor.user = user;
    monitor.type = type;
    monitor.name = name;
    monitor.url = url;
    monitor.type = type;
    monitor.isPaused = isPaused;
    monitor.port = port;
    monitor.frequency = frequency;
    monitor.alertFrequency = alertFrequency;


    await monitor.save();

    res.status(200).json({ message: "Monitor edited successfully" });
  } catch (error) {
    console.error("Error editing monitor:", error);
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
    const clientIpAddress = req?.ip; // Get the client's IP address from the request
   
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });
   
    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

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
 * /api/admin/monitors/resume:
 *   put:
 *     summary: resume a paused monitor
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
 *         description: Monitor resumed successfully
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
router.put("/monitors/resume", verifyToken, async (req, res) => {
  try {
    const clientIpAddress = req?.ip; // Get the client's IP address from the request
   
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });
   
    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

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

    res.status(200).json({ message: "Monitor resumed successfully" });
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
    const clientIpAddress = req?.ip; // Get the client's IP address from the request
   
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });
   
    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

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

/**
 * @swagger
 * /api/admin/ip-addresses:
 *   post:
 *     summary: Add a new IP address
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *               - token
 *             properties:
 *               address:
 *                 type: string
 *               token:
 *                 type: string
 *     responses:
 *       201:
 *         description: IP address added successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access Denied you are not an admin
 *       500:
 *         description: An internal server error occurred
 */
router.post('/ip-addresses',verifyToken, async (req, res) => {
  
  try {
    const admin = await Admin.findById(req.user.userId);
    
    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }
    const { address } = req.body;

    // Create a new IP address record
    const ipAddress = new IpAddress({ address });
    await ipAddress.save();

    res.status(201).json({ message: 'IP address added successfully' });
  } catch (error) {
    console.error('Error adding IP address:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

/**
 * @swagger
 * /api/admin/ip-addresses:
 *   delete:
 *     summary: Delete an IP address by ID
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - token
 *             properties:
 *               id:
 *                 type: string
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: IP address deleted successfully
 *       403:
 *         description: Access Denied you are not an admin
 *       404:
 *         description: IP address not found
 *       500:
 *         description: An internal server error occurred
 */
router.delete('/ip-addresses',verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);
    
    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }
    const { id } = req.body;

    // Check if the IP address exists
    const ipAddress = await IpAddress.findById(id);

    if (!ipAddress) {
      return res.status(404).json({ error: 'IP address not found' });
    }

    // Delete the IP address record
    await IpAddress.findByIdAndDelete(id);

    res.json({ message: 'IP address deleted successfully' });
  } catch (error) {
    console.error('Error deleting IP address:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

/**
 * @swagger
 * /api/admin/ip-addresses:
 *   put:
 *     summary: Edit an IP address by ID
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - token
 *               - address
 *             properties:
 *               id:
 *                 type: string
 *               token:
 *                 type: string
 *               address:
 *                 type: string
 *     responses:
 *       200:
 *         description: IP address edited successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access Denied you are not an admin
 *       404:
 *         description: IP address not found
 *       500:
 *         description: An internal server error occurred
 */
router.put('/ip-addresses',verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req?.user?.userId);
    
    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: "Access Denied you are not an admin" });
    }
   
    const {id, address } = req.body;

    // Check if the IP address exists
    const ipAddress = await IpAddress.findById(id);

    if (!ipAddress) {
      return res.status(404).json({ error: 'IP address not found' });
    }

    // Update the IP address record
    ipAddress.address = address;
    await ipAddress.save();

    res.json({ message: 'IP address edited successfully' });
  } catch (error) {
    console.error('Error editing IP address:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

/**
 * @swagger
 * /api/admin/all-ips:
 *   post:
 *     summary: Get IP addresses with pagination and optional IP address search
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - page
 *             properties:
 *               token:
 *                 type: string
 *               page:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *               search:
 *                 type: string
 *                 description: IP address search filter (optional)
 *                 example: "192.168.1.1"
 *     responses:
 *       200:
 *         description: List of IP addresses on the current page
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ips:
 *                   type: array
 *                   description: List of IP addresses on the current page
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *       403:
 *         description: Access Denied you are not an admin
 *       500:
 *         description: An internal server error occurred
 */
// Get IP addresses with pagination and optional search
router.post('/all-ips', verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);

    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: 'Access Denied you are not an admin' });
    }

    // Extract the page number and search parameter from the request body
    const { page, search } = req.body;

    // Define the page size (number of IP addresses per page)
    const pageSize = 10; // Set your desired page size

    let query = {}; // Initialize an empty query object

    // If a search term is provided, filter by IP address
    if (search) {
      query.address = { $regex: search, $options: 'i' }; // Case-insensitive search
    }

    // Count the total number of IP addresses that match the query
    const totalIPs = await IpAddress.countDocuments(query);

    // Calculate the total pages
    const totalPages = Math.ceil(totalIPs / pageSize);

    // Calculate the skip value based on the page number
    const skip = (page - 1) * pageSize;

    // Fetch IP addresses with pagination and the search query
    const ips = await IpAddress.find(query)
      .skip(skip)
      .limit(pageSize);

    res.status(200).json({ ips, totalPages,totalIPs });
  } catch (error) {
    console.error('Error fetching IP addresses:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});


/**
 * @swagger
 * /api/admin/add-contact:
 *   post:
 *     summary: Add a contact to a user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - userId
 *               - medium
 *               - value
 *             properties:
 *               token:
 *                 type: string
 *               userId:
 *                 type: string
 *               medium:
 *                 type: string
 *                 enum: ['email', 'sms', 'contact'] # Add more mediums as needed
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

// Add a contact to a user
router.post("/add-contact", verifyToken, async (req, res) => {
  try {
    const { userId, medium, value } = req.body;

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
    //console.log(clientIpAddress)
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

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

router.put('/user/edit-contacts', verifyToken, async (req, res) => {
  try {
    const { userId, contacts } = req.body;

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
    //console.log(clientIpAddress)
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    // Check if the user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update the user's contacts
    user.contacts = contacts;

    // Save the updated user
    await user.save();

    res.status(200).json({ message: 'Contacts edited successfully' });
  } catch (error) {
    console.error('Error editing contacts:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

/**
 * @swagger
 * /api/admin/contacts/get:
 *   post:
 *     summary: View contacts for a user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
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
 *     responses:
 *       200:
 *         description: List of contacts for the user
 *       404:
 *         description: User not found
 *       500:
 *         description: An internal server error occurred
 */

// View contacts for a user
router.post("/contacts/get", verifyToken, async (req, res) => {
  console.log("hit")
  try {
    const { userId } = req.body;

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
    //console.log(clientIpAddress)
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get the contacts for the user
    const contacts = user.contacts;

    res.status(200).json({ contacts });
  } catch (error) {
    console.error("Error listing contacts:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});



// Update a user by ID
router.put('/users/update',verifyToken, async (req, res) => {
  try {
    const { userId,updates } = req.body;
   
    // Find the user by ID and update the fields
    const updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true });

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
* @swagger
* /api/admin/delete-contact:
*   delete:
*     summary: Delete a user's contact
*     tags: [Admin]
*     security:
*       - bearerAuth: []
*     requestBody:
*       required: true
*       content:
*         application/json:
*           schema:
*             type: object
*             required:
*               - token
*               - userId
*               - contactId
*             properties:
*               token:
*                 type: string
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
// Delete a user's contact
router.delete("/delete-contact", verifyToken, async (req, res) => {
  try {
    const { userId, contactId } = req.body;

    const clientIpAddress = req?.ip; // Get the client's IP address from the request
    //console.log(clientIpAddress)
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });

    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find the index of the contact to delete
    const contactIndex = user.contacts.findIndex((contact) => contact._id.toString() === contactId);

    if (contactIndex === -1) {
      return res.status(404).json({ error: "Contact not found" });
    }

    // Remove the contact from the user's contacts array
    user.contacts.splice(contactIndex, 1);

    await user.save();

    res.status(200).json({ message: "Contact deleted successfully", user });
  } catch (error) {
    console.error("Error deleting contact:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});


// Protected API route
router.get('/protected', checkIpAddress, (req, res) => {
  res.json({ message: 'This is a protected API route.' });
});


// Middleware to check if the request's IP address is allowed
async function  checkIpAddress (req, res, next) {
 
  try {
    const clientIpAddress = req.ip; // Get the client's IP address from the request
   
    // Check if the client's IP address exists in the database
    const ipAddressExists = await IpAddress.exists({ address: clientIpAddress });
   
    if (!ipAddressExists) {
      return res.status(403).json({ error: 'Access denied. Your IP address is not allowed.' });
    }

    // IP address is allowed, proceed to the route handler
    next();
  } catch (error) {
    console.error('Error checking IP address:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};



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

