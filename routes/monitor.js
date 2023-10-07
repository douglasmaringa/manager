const express = require("express");
const jwt = require("jsonwebtoken");
const Monitor = require("../models/Monitor");
const User = require("../models/User");
const UptimeEvent = require("../models/UptimeEvent");
const router = express.Router();
const mongoose = require('mongoose');

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
 *               name:
 *                 type: string
 *               port:
 *                 type: number
 *               frequency:
 *                 type: number
 *               type:
 *                 type: string
 *               alertFrequency:
 *                 type: number
 *               contacts:
 *                 type: array
 *                 items:
 *                   type: string 
 *                   default: []   
 *     responses:
 *       201:
 *         description: Monitor created successfully
 *       500:
 *         description: An internal server error occurred
 */
// Create a new monitor
router.post("/monitors", verifyToken, async (req, res) => {
  try {
    const { url,name,port,frequency,type,alertFrequency,contacts } = req.body;

    // Extract user ID from the token
    const userId = req.user.userId;
    const port2 =  port || 443;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user?._id == userId) {
      return res.status(404).json({ error: "This is not your account" });
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
      name,
      type,
      isPaused: false,
      port:port2,
      frequency,
      alertFrequency:alertFrequency || 1,
      contacts: contacts || [], // Set the 'contacts' property
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
 *     summary: Get monitors that belong to a user with pagination
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
 *               page:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *     responses:
 *       200:
 *         description: Monitors retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 monitors:
 *                   type: array
 *                   description: List of monitors on the current page
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *       404:
 *         description: User not found
 *       500:
 *         description: An internal server error occurred
 */

router.post("/monitors/all", verifyToken, async (req, res) => {
  try {
    // Extract user ID from the token
    const userId = req.user.userId;

    // Extract request body parameters
    const { page, sortByName, typeFilter, statusFilter, searchText } = req.body;
    const pageSize = 7; // Set your desired page size

    // Define the sort criteria based on user input
    const sortCriteria = {};

    if (sortByName) {
      // Sort by name in ascending order by default
      sortCriteria.name = sortByName === "desc" ? -1 : 1;
    } else {
      // Sort by the latest monitors if sortByName is not included
      sortCriteria.createdAt = -1; // Sort by createdAt in descending order (latest first)
    }

    // Define the filter criteria
    const filterCriteria = {};

    if (typeFilter && typeFilter !== "all") {
      filterCriteria.type = typeFilter;
    }

    if (statusFilter && statusFilter !== "all") {
      filterCriteria.isPaused = statusFilter === "paused";
    }

    if (searchText !== "") {
      // Add fuzzy name search condition if searchText is provided
      filterCriteria.name = { $regex: new RegExp(searchText, "i") }; // Case-insensitive fuzzy search
    }

    // Count the total number of monitors belonging to the user with the applied filters
    const totalMonitors = await Monitor.countDocuments({ user: userId, ...filterCriteria });

    // Calculate the total pages
    const totalPages = Math.ceil(totalMonitors / pageSize);

    // Calculate the skip value based on the page number
    const skip = (page - 1) * pageSize;

    // Find monitors belonging to the user with pagination, filtering, and sorting
    const monitors = await Monitor.find({ user: userId, ...filterCriteria })
      .sort(sortCriteria)
      .skip(skip)
      .limit(pageSize);

    // Loop through monitors and calculate average uptime for each
    for (const monitor of monitors) {
      const avgUptime24h = await calculateAverageUptime(1, monitor._id);
      // Add the calculated stats to each monitor
      monitor.stats = avgUptime24h;
    }

    res.status(200).json({ monitors, totalPages });
  } catch (error) {
    console.error("Error fetching monitors:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});


const calculateAverageUptime = async (durationInDays, id) => {
  // Get the date 'durationInDays' ago
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - durationInDays);

  // Fetch all uptime events within the specified duration for the user's monitors
  const uptimeEvents = await UptimeEvent.find({
    timestamp: { $gte: startDate },
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
    if (event.availability === 'Up' || event.ping === 'Reachable' || event.port === 'Open') {
      totalUpTime += timeDifference;
    }
    lastTimestamp = event.timestamp;
  }

  // If the last event was 'Up', consider uptime until the current time
  if (uptimeEvents[uptimeEvents.length - 1].availability === 'Up' || uptimeEvents[uptimeEvents.length - 1].ping === 'Reachable' || uptimeEvents[uptimeEvents.length - 1].port === 'Open') {
    const currentTime = new Date();
    const timeDifference = currentTime - lastTimestamp;
    totalUpTime += timeDifference;
  }

  // Calculate average uptime
  const totalDuration = durationInDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
  const averageUptime = (totalUpTime / totalDuration) * 100; // Percentage

  return averageUptime.toFixed(0); // Return average uptime rounded to 2 decimal places
};


/**
 * @swagger
 * /api/monitor/monitors/search:
 *   post:
 *     summary: Search monitors that belong to a user with pagination
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
 *               page:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *               url:
 *                 type: string
 *                 description: Search term for filtering monitors
 *                 example: "monitor_url"
 *     responses:
 *       200:
 *         description: Monitors retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 monitors:
 *                   type: array
 *                   description: List of monitors matching the search criteria on the current page
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *       404:
 *         description: User not found
 *       500:
 *         description: An internal server error occurred
 */
// Search monitors by URL for the user with pagination
router.post("/monitors/search", verifyToken, async (req, res) => {
  try {
    // Extract user ID from the token
    const userId = req.user.userId;

    // Extract the page number and URL search term from the request body
    const { page, url } = req.body;
    const pageSize = 10; // Set your desired page size

    // Count the total number of monitors matching the URL search criteria
    const totalMonitors = await Monitor.countDocuments({
      user: userId,
      url: { $regex: url, $options: "i" }, // Case-insensitive URL search
    });

    // Calculate the total pages
    const totalPages = Math.ceil(totalMonitors / pageSize);

    // Calculate the skip value based on the page number
    const skip = (page - 1) * pageSize;

    // Find monitors matching the URL search criteria with pagination
    const monitors = await Monitor.find({
      user: userId,
      url: { $regex: url, $options: "i" }, // Case-insensitive URL search
    })
      .skip(skip)
      .limit(pageSize);

    res.status(200).json({ monitors, totalPages });
  } catch (error) {
    console.error("Error searching monitors:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});


/**
 * @swagger
 * /api/monitor/monitors/uptimeevents:
 *   post:
 *     summary: Get uptime events for a monitor, sorted by latest, with pagination
 *     tags: [Monitors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - page
 *             properties:
 *               token:
 *                 type: string
 *                 description: JWT token obtained after login
 *                 example: "your_jwt_token_here"
 *               id:
 *                 type: string
 *               page:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *     responses:
 *       200:
 *         description: Uptime events retrieved successfully
 *       404:
 *         description: Monitor not found
 *       500:
 *         description: An internal server error occurred
 */

// Fetch uptime events for a monitor, sorted by latest, with pagination
router.post("/monitors/uptimeevents", verifyToken, async (req, res) => {
  try {
    const { id, page } = req.body;

    // Extract user ID from the token
    const userId = req.user.userId;

    // Find the monitor and ensure it belongs to the user
    const monitor = await Monitor.findOne({ _id: id, user: userId });
    if (!monitor) {
      return res.status(404).json({ error: "Monitor not found" });
    }

    // Define the page size (number of uptime events per page)
    const pageSize = 10; // Set your desired page size

    // Calculate the skip value based on the page number
    const skip = (page - 1) * pageSize;

     // Count the total number of monitors belonging to the user
     const totalMonitors = await UptimeEvent.countDocuments({ monitor: id });

     // Calculate the total pages
     const totalPages = Math.ceil(totalMonitors / pageSize);
 

    // Fetch uptime events for the monitor, sorted by the latest, with pagination
    const uptimeEvents = await UptimeEvent.find({ monitor: id })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(pageSize)
      .exec();

    res.status(200).json({
      Url: monitor?.url,
      frequency: monitor?.frequency,
      port: monitor?.port,
      uptimeEvents,
      type: monitor?.type,
      totalPages:totalPages,
    });
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
 * /api/monitor/monitors/bulk-pause:
 *   put:
 *     summary: Pause or Resume multiple monitors in bulk
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
 *               monitorIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of monitor IDs to pause or resume
 *                 example: ["monitor_id_1", "monitor_id_2"]
 *               pause:
 *                 type: boolean
 *                 description: true to pause monitors, false to resume
 *                 example: true
 *     responses:
 *       200:
 *         description: Monitors bulk paused or resumed successfully
 *       404:
 *         description: Monitor not found
 *       500:
 *         description: An internal server error occurred
 */

// Bulk pause or resume monitors
router.put("/monitors/bulk-pause", async (req, res) => {
  try {
    const { monitorIds, pause, token } = req.body;

    // Find and update monitors in bulk based on the provided monitor IDs
    const updateResult = await Monitor.updateMany(
      { _id: { $in: monitorIds } },
      { $set: { isPaused: pause } }
    );

    if (updateResult.nModified === 0) {
      return res.status(404).json({ error: "No monitors were found for the provided IDs" });
    }

    res.status(200).json({ message: "Monitors bulk paused or resumed successfully" });
  } catch (error) {
    console.error("Error bulk pausing monitors:", error);
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

    // Fetch all monitors belonging to the user
    const userMonitors = await Monitor.find({ user: userId });

    let upMonitors = 0;
    let downMonitors = 0;
    let pausedMonitors = 0;

    // Loop through each monitor to determine its status based on the latest uptime event
    for (const monitor of userMonitors) {
      if (monitor.isPaused) {
        pausedMonitors++;
        continue; // Skip the rest of the loop for paused monitors
      }

      // Fetch the latest uptime event for the monitor
      const latestUptimeEvent = await UptimeEvent.findOne({ monitor: monitor._id }).sort({ timestamp: -1 });

      if (!latestUptimeEvent) {
        // If no uptime events are found, assume the monitor is down
        downMonitors++;
      } else if (
        (latestUptimeEvent.availability === "Up") ||
        (latestUptimeEvent.ping === "Reachable" || latestUptimeEvent.port === "Open")
      ) {
        // If the latest uptime event indicates the monitor is up
        upMonitors++;
      } else {
        // If the latest uptime event indicates the monitor is down
        downMonitors++;
      }
    }

    const totalMonitors = userMonitors.length;

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

// Fetch the latest downtime event from the entire system
router.post("/monitoring/latest-downtime", verifyToken, async (req, res) => {
  try {
    // Find the latest downtime event across all monitors
    const latestDowntimeEvent = await UptimeEvent.findOne({
      $or: [
        { availability: 'Down' },
        { port: 'Closed' },
        { ping: 'Unreachable' }
      ]
    }).sort({ timestamp: -1 })
      .populate('monitor', 'name');

    if (latestDowntimeEvent) {
      const currentTime = new Date();
      const downtimeDuration = currentTime - latestDowntimeEvent.timestamp;

      // Prepare the response data
      const response = {
        monitorId: latestDowntimeEvent.monitor._id,
        name: latestDowntimeEvent.monitor.name,
        timestamp: latestDowntimeEvent.timestamp,
        duration: downtimeDuration,
      };

      res.status(200).json(response);
    } else {
      res.status(404).json({ message: 'No downtime events found in the system' });
    }
  } catch (error) {
    console.error("Error fetching latest downtime event:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});




/**
 * @swagger
 * /api/monitor/monitoring/updown:
 *   post:
 *     summary: Get latest events for all monitors with pagination
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
 *               page:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *     responses:
 *       200:
 *         description: Latest events retrieved successfully
 *       500:
 *         description: An internal server error occurred
 */
router.post("/monitoring/updown", verifyToken, async (req, res) => {
  try {
    // Extract user ID from the token
    const userId = req.user.userId;
    const page = req.body.page || 1; // Get the page number from the request body, default to 1 if not provided
    const pageSize = 10; // Set your desired page size

    // Function to determine event type based on availability, ping, and port
    const determineEventType = (event) => {
      if (event.availability === 'Up' || event.ping === 'Reachable' || event.port === 'Open') {
        return 'Uptime';
      } else {
        return 'Downtime';
      }
    };

    const fetchLatestEventsForUser = async (userId, page) => {
      // Find all the latest uptime events for the user and populate the 'monitor' field
      const latestEventsForUser = await UptimeEvent.aggregate([
        {
          $match: { userId: mongoose.Types.ObjectId(userId) }
        },
        {
          $sort: { "monitor": 1, timestamp: -1 } // Sort by monitor and timestamp
        },
        {
          $group: {
            _id: "$monitor",
            latestEvent: { $first: "$$ROOT" }
          }
        },
        {
          $replaceRoot: { newRoot: "$latestEvent" }
        },
        {
          $lookup: {
            from: "monitors", // Replace with the actual collection name for monitors
            localField: "monitor",
            foreignField: "_id",
            as: "monitor"
          }
        },
        {
          $unwind: "$monitor"
        },
        {
          $project: {
            "monitor.isPaused": 1,
            "monitor.name": 1,
            "monitor.type": 1, // Add any other monitor fields you need
            "_id": 0, // Exclude the _id field if needed
            uptimeEvent: "$$ROOT",
          }
        }
      ]);

      // Calculate the total number of pages
      const totalEvents = latestEventsForUser.length;
      const totalPages = Math.ceil(totalEvents / pageSize);

      // Get events for the specified page
      const startIndex = (page - 1) * pageSize;
      const endIndex = page * pageSize;
      const eventsForPage = latestEventsForUser.slice(startIndex, endIndex);

      // Determine event type for each event and include timestamp and status
      const eventsWithAvailability = eventsForPage.map((event) => {
        const eventType = determineEventType(event.uptimeEvent);
        const status = event.uptimeEvent.availability || event.uptimeEvent.ping || event.uptimeEvent.port; // Replace with the actual status field in your UptimeEvent schema

        return {
          monitorId: event.monitor._id,
          isPaused: event.monitor.isPaused,
          name: event.monitor.name,
          type: event.monitor.type,
          timestamp: event.uptimeEvent.timestamp, // Corrected to access timestamp from uptimeEvent
          status: status,
          duration: eventType,
          type: eventType,
        };
      });

      return { totalEvents, totalPages, events: eventsWithAvailability };
    };

    const result = await fetchLatestEventsForUser(userId, page);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching latest events:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});


/**
 * @swagger
 * /api/monitor/monitoring/alluptimestats:
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
 *     responses:
 *       200:
 *         description: Overall uptime statistics retrieved successfully
 *       500:
 *         description: An internal server error occurred
 */

router.post("/monitoring/alluptimestats", verifyToken, async (req, res) => {
  try {
    // Extract user ID from the token
    const userId = req.user.userId;

    // Fetch all uptime events for the user
    const uptimeEvents = await UptimeEvent.find({ userId });

    // Calculate average uptime percentage for the last 24 hours
    const uptimePercentage24h = calculateAverageUptime2(
      24 * 60 * 60 * 1000,
      uptimeEvents
    );

    // Calculate average uptime percentage for the last 7 days
    const uptimePercentage7d = calculateAverageUptime2(
      7 * 24 * 60 * 60 * 1000,
      uptimeEvents
    );

    // Calculate average uptime percentage for the last 30 days
    const uptimePercentage30d = calculateAverageUptime2(
      30 * 24 * 60 * 60 * 1000,
      uptimeEvents
    );

    res.status(200).json({
      uptimePercentage24h: uptimePercentage24h.toFixed(2),
      uptimePercentage7d: uptimePercentage7d.toFixed(2),
      uptimePercentage30d: uptimePercentage30d.toFixed(2),
    });
  } catch (error) {
    console.error("Error fetching uptime events:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

function calculateAverageUptime2(durationInMilliseconds, uptimeEvents) {
  const currentTime = new Date();
  const thresholdTime = new Date(currentTime - durationInMilliseconds);

  // Filter uptime events within the specified duration
  const recentUptimeEvents = uptimeEvents.filter((event) => {
    // Check if availability is "Up," ping is "Reachable," or port is "Open"
    if (
      event.availability === "Up" ||
      event.ping === "Reachable" ||
      event.port === "Open"
    ) {
      // Check if the event timestamp is within the specified duration
      return event.timestamp >= thresholdTime;
    }
    return false;
  });

  // If there are no recent events, assume 100% uptime
  if (recentUptimeEvents.length === 0) {
    return 100;
  }

  // Calculate the total duration of uptime within the duration
  let totalUptimeDuration = 0;
  let lastTimestamp = thresholdTime;

  recentUptimeEvents.forEach((event) => {
    const timeDifference = event.timestamp - lastTimestamp;
    totalUptimeDuration += timeDifference;
    lastTimestamp = event.timestamp;
  });

  // Calculate average uptime percentage
  const totalDuration = durationInMilliseconds;
  const uptimePercentage = (totalUptimeDuration / totalDuration) * 100;

  return uptimePercentage;
}





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
    const { url,name,port,frequency,type,alertFrequency,contacts } = req.body;

    // Find the monitor and ensure it belongs to the user
    const monitor = await Monitor.findOne({ _id: monitorId, user: req.user.userId });
    if (!monitor) {
      return res.status(404).json({ error: "Monitor not found" });
    }

    // Update the monitor fields
    monitor.url = url;
    monitor.name = name;
    monitor.type = type;
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
 * /api/monitor/monitors/remove:
 *   delete:
 *     summary: Delete a monitor
 *     tags: [Monitors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               monitorId:
 *                 type: string
 *               token:
 *                 type: string
 *                 description: JWT token obtained after login
 *                 example: "your_jwt_token_here"
 *     responses:
 *       200:
 *         description: Monitor deleted successfully
 *       404:
 *         description: Monitor not found
 *       500:
 *         description: An internal server error occurred
 */

// Delete a monitor
router.delete("/monitors/remove",verifyToken, async (req, res) => {
  console.log("hit")
  try {
    const monitorId = req.body.monitorId;
    console.log(monitorId)
   
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
