const express = require("express");
const jwt = require("jsonwebtoken");
const Monitor = require("../models/Monitor");
const UptimeEvent = require("../models/UptimeEvent");
const router = express.Router();

// Create a new monitor
router.post("/monitors", verifyToken, async (req, res) => {
  try {
    const { url,port,frequency,type } = req.body;

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
      frequency
    });

    // Save the monitor to the database
    await newMonitor.save();

    res.status(201).json({ message: "Monitor created successfully" });
  } catch (error) {
    console.error("Error creating monitor:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});


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
    monitor.isPaused = true;
    await monitor.save();

    res.status(200).json({ message: "Monitor paused successfully" });
  } catch (error) {
    console.error("Error pausing monitor:", error);
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
