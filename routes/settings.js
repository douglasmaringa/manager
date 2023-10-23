const express = require("express");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const MonitorAgent = require('../models/MonitorAgent'); // Import the Monitor model

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: The settings API
 */

/**
 * @swagger
 * /api/settings/create/monitorAgent:
 *   post:
 *     summary: Create a new monitor agent changes only take place after 24 hours to avoid every monitor call calling the database each time it needs to run.
 *     tags: [Settings]
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
 *               - region
 *               - url
 *               - type
 *             properties:
 *               token:
 *                 type: string
 *               region:
 *                 type: string
 *               url:
 *                 type: string
 *               type:
 *                 type: string
 *                 example: monitorAgents or alertAgents
 *     responses:
 *       201:
 *         description: Monitor agent created successfully
 *       403:
 *         description: Access Denied you are not an admin
 *       500:
 *         description: An internal server error occurred
 */
router.post('/create/monitorAgent', verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);

    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: 'Access Denied you are not an admin' });
    }

    const { region, url, type } = req.body;

    // Create a new monitor
    const newMonitor = new MonitorAgent({
      type,
      region,
      url,
    });

    await newMonitor.save();

    res.status(201).json({ message: 'Monitor agent created successfully' });
  } catch (error) {
    console.error('Error creating monitor agent:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

/**
 * @swagger
 * /api/settings/edit/monitor/{id}:
 *   put:
 *     summary: Update a monitor agent by ID
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - region
 *               - url
 *               - type
 *             properties:
 *               token:
 *                 type: string
 *               region:
 *                 type: string
 *               url:
 *                 type: string
 *               type:
 *                 type: string
 *                 example: monitorAgents or alertAgents
 *     responses:
 *       200:
 *         description: Monitor agent updated successfully
 *       403:
 *         description: Access Denied you are not an admin
 *       404:
 *         description: Monitor agent not found
 *       500:
 *         description: An internal server error occurred
 */
router.put('/edit/monitor/:id', verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);

    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: 'Access Denied you are not an admin' });
    }

    const monitorId = req.params.id;
    const { region, url, type } = req.body;

    // Find the monitor and update its details
    const monitor = await MonitorAgent.findByIdAndUpdate(monitorId, { region, url, type }, { new: true });

    if (!monitor) {
      return res.status(404).json({ error: 'Monitor agent not found' });
    }

    res.status(200).json({ message: 'Monitor agent updated successfully' });
  } catch (error) {
    console.error('Error updating monitor agent:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

/**
 * @swagger
 * /api/settings/delete/monitor/{id}:
 *   delete:
 *     summary: Delete a monitor agent by ID
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Monitor agent deleted successfully
 *       403:
 *         description: Access Denied you are not an admin
 *       404:
 *         description: Monitor agent not found
 *       500:
 *         description: An internal server error occurred
 */
router.delete('/delete/monitor/:id', verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);

    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: 'Access Denied you are not an admin' });
    }

    const monitorId = req.params.id;

    // Delete the monitor
    const deletedMonitor = await MonitorAgent.findByIdAndRemove(monitorId);

    if (!deletedMonitor) {
      return res.status(404).json({ error: 'Monitor agent not found' });
    }

    res.status(200).json({ message: 'Monitor agent deleted successfully' });
  } catch (error) {
    console.error('Error deleting monitor agent:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

/**
 * @swagger
 * /api/settings/all-monitors:
 *   post:
 *     summary: Get monitor agents with pagination and optional URL search
 *     tags: [Settings]
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
 *                 description: URL search filter
 *                 example: "https://example.com"
 *     responses:
 *       200:
 *         description: List of monitor agents on the current page
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 monitors:
 *                   type: array
 *                   description: List of monitor agents on the current page
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *       403:
 *         description: Access Denied you are not an admin
 *       500:
 *         description: An internal server error occurred
 */
router.post('/all-monitors', verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);

    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: 'Access Denied you are not an admin' });
    }

    // Extract the page number and search parameter from the request body
    const { page, search } = req.body;

    // Define the page size (number of monitor agents per page)
    const pageSize = 10; // Set your desired page size

    let query = {}; // Initialize an empty query object

    // If a search term is provided, filter by URL
    if (search) {
      query.url = { $regex: search, $options: 'i' }; // Case-insensitive search
    }

    // Count the total number of monitor agents that match the query
    const totalMonitors = await MonitorAgent.countDocuments(query);

    // Calculate the total pages
    const totalPages = Math.ceil(totalMonitors / pageSize);

    // Calculate the skip value based on the page number
    const skip = (page - 1) * pageSize;

    // Fetch monitor agents with pagination and the search query
    const monitors = await MonitorAgent.find(query)
      .skip(skip)
      .limit(pageSize);

    res.status(200).json({ monitors, totalPages,totalMonitors });
  } catch (error) {
    console.error('Error fetching monitor agents:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});


/**
 * @swagger
 * /api/settings/all-monitors/search:
 *   post:
 *     summary: Search monitor agents by Ip Address with pagination
 *     tags: [Settings]
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
 *               - url
 *             properties:
 *               token:
 *                 type: string
 *               url:
 *                 type: string
 *                 description: URL to search for
 *                 example: "http://example.com"
 *               page:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *     responses:
 *       200:
 *         description: List of monitor agents matching the URL on the current page
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 monitors:
 *                   type: array
 *                   description: List of monitor agents matching the URL on the current page
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *       403:
 *         description: Access Denied you are not an admin
 *       500:
 *         description: An internal server error occurred
 */

// Search monitor agents by URL with pagination
router.post('/all-monitors/search', verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);

    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: 'Access Denied you are not an admin' });
    }

    // Extract the URL and page number from the request body
    const { url, page } = req.body;

    // Define the page size (number of monitor agents per page)
    const pageSize = 10; // Set your desired page size

    // Count the total number of monitor agents matching the URL search criteria
    const totalMonitors = await MonitorAgent.countDocuments({
      url: { $regex: url, $options: 'i' }, // Case-insensitive URL search
    });

    // Calculate the total pages
    const totalPages = Math.ceil(totalMonitors / pageSize);

    // Calculate the skip value based on the page number
    const skip = (page - 1) * pageSize;

    // Fetch monitor agents matching the URL search criteria with pagination
    const monitors = await MonitorAgent.find({
      url: { $regex: url, $options: 'i' }, // Case-insensitive URL search
    })
      .skip(skip)
      .limit(pageSize);

    res.status(200).json({ monitors, totalPages });
  } catch (error) {
    console.error('Error searching monitor agents by URL:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});


/**
 * @swagger
 * /api/settings/create/monitorAgent:
 *   post:
 *     summary: Create a new monitor agent
 *     tags: [Settings]
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
 *               - region
 *               - url
 *               - type
 *             properties:
 *               token:
 *                 type: string
 *               region:
 *                 type: string
 *               url:
 *                 type: string
 *               type:
 *                 type: string
 *     responses:
 *       201:
 *         description: Monitor agent created successfully
 *       403:
 *         description: Access Denied you are not an admin
 *       500:
 *         description: An internal server error occurred
 */
router.post('/create/monitorAgent', verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId);

    // Check if the user is an admin
    if (!admin?.isAdmin) {
      return res.status(403).json({ error: 'Access Denied you are not an admin' });
    }

    const { region, url, type } = req.body;

    // Create a new monitor
    const newMonitor = new MonitorAgent({
      type,
      region,
      url,
    });

    await newMonitor.save();

    res.status(201).json({ message: 'Monitor agent created successfully' });
  } catch (error) {
    console.error('Error creating monitor agent:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

// Middleware function to verify the JWT token
function verifyToken(req, res, next) {
  const token = req.body.token;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  jwt.verify(token, 'secret', (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = decoded;
    next();
  });
}

module.exports = router;
