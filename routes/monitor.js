const express = require("express");
const jwt = require("jsonwebtoken");
const Monitor = require("../models/Monitor");
const UptimeEvent = require("../models/UptimeEvent");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Monitors
 *   description: The monitors API
 * /api/monitor/monitors:
 *   post:
 *     summary: Create a monitor Web url start with http://www.example.com or http://142.251.32.46 other urls start with www.example.com or 142.251.32.46 you have web port ping types and frequency is a number from 1,5,10,30,60 minutes.
 *     tags: [Monitors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 default: when you login you got a token paste that token here
 *               url:
 *                 type: string
 *               port:
 *                 type: number
 *               frequency:
 *                 type: number
 *               type:
 *                 type: string
 *               alertFrequency:
 *                 type: number
 *     responses:
 *       201:
 *         description: Monitor created successfully
 *       500:
 *         description: An internal server error occurred
 */
// Create a new monitor
router.post("/monitors", verifyToken, async (req, res) => {
  try {
    const { url,port,frequency,type,alertFrequency } = req.body;

    // Extract user ID from the token
    const userId = req.user.userId;
    const port2 =  port || 443;

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
 * /api/monitor/monitors/all:
 *   post:
 *     summary: Get all monitors that belong to a user
 *     tags: [Monitors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: JWT token obtained after login
 *                 example: "your_jwt_token_here"
 *     responses:
 *       200:
 *         description: Monitors retrieved successfully
 *       404:
 *         description: User not found
 *       500:
 *         description: An internal server error occurred
 */

// Fetch all monitors for the user
router.post("/monitors/all", verifyToken, async (req, res) => {
  try {
    // Extract user ID from the token
    const userId = req.user.userId;

    // Find all monitors belonging to the user
    const monitors = await Monitor.find({ user: userId });

    res.status(200).json({ monitors });
  } catch (error) {
    console.error("Error fetching monitors:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/monitor/monitors/uptimeevents:
 *   post:
 *     summary: Get all uptime events for a monitor, sorted by latest
 *     tags: [Monitors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               token:
 *                 type: string
 *                 description: JWT token obtained after login
 *                 example: "your_jwt_token_here"
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Uptime events retrieved successfully
 *       404:
 *         description: Monitor not found
 *       500:
 *         description: An internal server error occurred
 */


// Fetch all uptime events for a monitor, sorted by latest
router.post("/monitors/uptimeevents", verifyToken, async (req, res) => {
  try {
    const { id } = req.body;

     // Extract user ID from the token
    const userId = req.user.userId;

      // Find the monitor and ensure it belongs to the user
      const monitor = await Monitor.findOne({ _id: id, user: userId });
      if (!monitor) {
        return res.status(404).json({ error: "Monitor not found" });
      }

      // Fetch all uptime events for the monitor, sorted by the latest
      const uptimeEvents = await UptimeEvent.find({ monitor: id })
        .sort({ timestamp: -1 })
        .exec();

      res.status(200).json({ Url:monitor?.url,frequency:monitor?.frequency,port:monitor?.port,uptimeEvents:uptimeEvents,type:monitor?.type });
    
  } catch (error) {
    console.error("Error fetching uptime events:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/monitor/monitors/{id}/pause:
 *   put:
 *     summary: Pause or Resume a monitor
 *     tags: [Monitors]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the monitor
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               token:
 *                 type: string
 *                 description: JWT token obtained after login
 *                 example: "your_jwt_token_here"
 *     responses:
 *       200:
 *         description: Monitor paused successfully
 *       404:
 *         description: Monitor not found
 *       500:
 *         description: An internal server error occurred
 */

// Update a monitor and set isPaused to true
router.put("/monitors/:id/pause", async (req, res) => {
  try {
    const monitorId = req.params.id;
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
 * /api/monitor/monitoring/stats:
 *   post:
 *     summary: Get monitoring statistics
 *     tags: [Monitors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: JWT token obtained after login
 *                 example: "your_jwt_token_here"
 *     responses:
 *       200:
 *         description: Monitoring statistics retrieved successfully
 *       500:
 *         description: An internal server error occurred
 */

// Fetch monitoring statistics
router.post("/monitoring/stats", verifyToken, async (req, res) => {
  try {
    // Extract user ID from the token
    const userId = req.user.userId;

    // Count the total number of monitors for the user
    const totalMonitors = await Monitor.countDocuments({ user: userId });

    // Count the number of monitors that are paused
    const pausedMonitors = await Monitor.countDocuments({ user: userId, isPaused: true });

    // Count the number of monitors that are up
    const upMonitors = await Monitor.countDocuments({ user: userId, isPaused: true });

    // Count the number of monitors that are down
    const downMonitors = await Monitor.countDocuments({ user: userId, isPaused: false });

    res.status(200).json({
      totalMonitors,
      upMonitors,
      downMonitors,
      pausedMonitors,
    });
  } catch (error) {
    console.error("Error fetching monitoring stats:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/monitor/monitoring/uptime:
 *   post:
 *     summary: Get overall uptime statistics
 *     tags: [Monitors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: JWT token obtained after login
 *                 example: "your_jwt_token_here"
 *               id:
 *                 type: string
 *                 description: monitor id
 *                 example: "id of monitor you want to check"
 *     responses:
 *       200:
 *         description: Overall uptime statistics retrieved successfully
 *       500:
 *         description: An internal server error occurred
 */

// Fetch overall uptime statistics
router.post("/monitoring/uptime", verifyToken, async (req, res) => {
  try {
    // Extract user ID from the token
    const userId = req.user.userId;
    const id = req.body.id;

    const calculateAverageUptime = async (durationInDays, userId) => {
      // Get the date 'durationInDays' ago
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - durationInDays);
    
      // Fetch all uptime events within the specified duration for the user's monitors
      const uptimeEvents = await UptimeEvent.find({
        timestamp: { $gte: startDate },
        'monitor.user': userId,
        monitor:id
      }).sort({ timestamp: 1 });
    
      // If there are no uptime events within the duration, assume the monitor was up the entire time
      if (uptimeEvents.length === 0) {
        return 100; // 100% uptime
      }
    
      // Calculate the total time the monitors were up within the duration
      let totalUpTime = 0;
      let lastTimestamp = startDate;
    
      for (const event of uptimeEvents) {
        const timeDifference = event.timestamp - lastTimestamp;
        if (event.availability === 'Up') {
          totalUpTime += timeDifference;
        }
        lastTimestamp = event.timestamp;
      }
    
      // If the last event was 'Up', consider uptime until the current time
      if (uptimeEvents[uptimeEvents.length - 1].availability === 'Up') {
        const currentTime = new Date();
        const timeDifference = currentTime - lastTimestamp;
        totalUpTime += timeDifference;
      }
    
      // Calculate average uptime
      const totalDuration = durationInDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
      const averageUptime = (totalUpTime / totalDuration) * 100; // Percentage
    
      return averageUptime.toFixed(2); // Return average uptime rounded to 2 decimal places
    };
    

    const avgUptime24h = await calculateAverageUptime(1);
    const avgUptime7d = await calculateAverageUptime(7);
    const avgUptime30d = await calculateAverageUptime(30);

    res.status(200).json({
      avgUptime24h,
      avgUptime7d,
      avgUptime30d,
    });
  } catch (error) {
    console.error("Error fetching overall uptime stats:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/monitor/monitoring/latest-downtime:
 *   post:
 *     summary: Get latest downtime event
 *     tags: [Monitors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: JWT token obtained after login
 *                 example: "your_jwt_token_here"
 *     responses:
 *       200:
 *         description: Latest downtime event retrieved successfully
 *       500:
 *         description: An internal server error occurred
 */


// Fetch latest downtime event for all monitors belonging to a user
router.post("/monitoring/latest-downtime", verifyToken, async (req, res) => {
  try {
    // Extract user ID from the token
    const userId = req.user.userId;

    const fetchLatestDowntimeForMonitors = async (userId) => {
      // Fetch all monitors belonging to the user
      const monitors = await Monitor.find({ user: userId });

      const latestDowntimeForMonitors = [];

      // Loop through each monitor and find its latest downtime event
      for (const monitor of monitors) {
        let downtimeEventCriteria = {};

        if (monitor.type === 'web') {
          downtimeEventCriteria = { availability: 'Down' };
        } else if (monitor.type === 'ping') {
          downtimeEventCriteria = { ping: 'Unreachable' };
        }else {
          downtimeEventCriteria = {  port: 'Closed' };
        }

        const latestDowntimeEvent = await UptimeEvent.findOne({
          monitor: monitor._id,
          ...downtimeEventCriteria,
        }).sort({ timestamp: -1 });

        if (latestDowntimeEvent) {
          latestDowntimeForMonitors.push({
            monitorId: monitor._id,
            latestDowntimeEvent,
          });
        }
      }

      return latestDowntimeForMonitors;
    };

    const latestDowntime = await fetchLatestDowntimeForMonitors(userId);

    res.status(200).json(latestDowntime);
  } catch (error) {
    console.error("Error fetching latest downtime:", error);
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

/**
 * @swagger
 * /api/monitor/monitors/{id}:
 *   put:
 *     summary: Update a monitor
 *     tags: [Monitors]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the monitor to be updated
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *               port:
 *                 type: string
 *               frequency:
 *                 type: string
 *               alertFrequency:
 *                 type: string
 *               token:
 *                 type: string
 *                 description: JWT token obtained after login
 *                 example: "your_jwt_token_here"
 *     responses:
 *       200:
 *         description: Monitor updated successfully
 *       404:
 *         description: Monitor not found
 *       500:
 *         description: An internal server error occurred
 */

  // Update a monitor
router.put("/monitors/:id", verifyToken, async (req, res) => {
  try {
    const monitorId = req.params.id;
    const { url, port, frequency, alertFrequency } = req.body;

    // Find the monitor and ensure it belongs to the user
    const monitor = await Monitor.findOne({ _id: monitorId, user: req.user.userId });
    if (!monitor) {
      return res.status(404).json({ error: "Monitor not found" });
    }

    // Update the monitor fields
    monitor.url = url;
    monitor.port = port;
    monitor.frequency = frequency;
    monitor.alertFrequency = alertFrequency;

    await monitor.save();

    res.status(200).json({ message: "Monitor updated successfully" });
  } catch (error) {
    console.error("Error updating monitor:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

/**
 * @swagger
 * /api/monitor/monitors/{id}:
 *   delete:
 *     summary: Delete a monitor
 *     tags: [Monitors]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the monitor to be deleted
 *     responses:
 *       200:
 *         description: Monitor deleted successfully
 *       404:
 *         description: Monitor not found
 *       500:
 *         description: An internal server error occurred
 */



// Delete a monitor
router.delete("/monitors/:id", async (req, res) => {
  try {
    const monitorId = req.params.id;

    // Find the monitor and ensure it belongs to the user
    const monitor = await Monitor.findOne({ _id: monitorId, user: req.user.userId });
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

// Bulk actions for monitors (start, pause, reset stats)
router.post("/monitors/bulk-actions", verifyToken, async (req, res) => {
  try {
    const { action, monitorIds } = req.body;

    // Validate the action
    if (!["start", "pause", "reset"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    // Update monitors based on the action
    const updateField = action === "pause" ? "isPaused" : "lastAlertSentAt";
    await Monitor.updateMany({ _id: { $in: monitorIds }, user: req.user.userId }, { [updateField]: action === "reset" ? null : new Date() });

    res.status(200).json({ message: `Monitors ${action}ed successfully` });
  } catch (error) {
    console.error("Error performing bulk action:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

module.exports = router;
