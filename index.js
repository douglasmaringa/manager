const express = require("express");
const app = express();
const mongoose = require("mongoose");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const Agenda = require("agenda");
const performCronJob1 = require("./cronJobs/1minute");
const performCronJob5 = require("./cronJobs/5minute");
const performCronJob10 = require("./cronJobs/10minute");
const performCronJob30 = require("./cronJobs/30minute");
const performCronJob60 = require("./cronJobs/60minute");

// Additional imports for Swagger documentation
const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");


// Routes imports
const userRoute = require("./routes/user");
const monitorRoute = require("./routes/monitor");

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Your API Documentation",
      version: "1.0.0",
      description: "API documentation for your application",
    },
  },
  apis: ["./routes/*.js"], // Specify the path to your route files
};

const swaggerSpec = swaggerJsDoc(swaggerOptions);

async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://your-username:your-password@185.150.190.136:27017/your-database-name', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log("DB connected successfully");

    // Initialize Agenda
    const agenda1 = new Agenda({ mongo: mongoose.connection });
    const agenda5 = new Agenda({ mongo: mongoose.connection });
    const agenda10 = new Agenda({ mongo: mongoose.connection });
    const agenda30 = new Agenda({ mongo: mongoose.connection });
    const agenda60 = new Agenda({ mongo: mongoose.connection });

    // Define the job types
    agenda1.define("performCronJob1", async (job) => {
      await performCronJob1();
    });

    agenda5.define("performCronJob5", async (job) => {
      await performCronJob5();
    });

    agenda10.define("performCronJob10", async (job) => {
      await performCronJob10();
    });

    agenda30.define("performCronJob30", async (job) => {
      await performCronJob30();
    });

    agenda60.define("performCronJob60", async (job) => {
      await performCronJob60();
    });

    // Before starting the server, cancel and remove all existing jobs
    await agenda1.cancel({});
    await agenda5.cancel({});
    await agenda10.cancel({});
    await agenda30.cancel({});
    await agenda60.cancel({});

    // Start the agenda schedulers
    await agenda1.start();
    await agenda5.start();
    await agenda10.start();
    await agenda30.start();
    await agenda60.start();

    // Schedule the cron jobs
    agenda1.every("*/1 * * * *", "performCronJob1");
    agenda5.every("*/5 * * * *", "performCronJob5");
    agenda10.every("*/10 * * * *", "performCronJob10");
    agenda30.every("*/30 * * * *", "performCronJob30");
    agenda60.every("0 * * * *", "performCronJob60");

    // Middleware
    app.use(express.json());
    app.use(helmet());
    app.use(morgan("common"));
    app.use(cors());

    // Serve Swagger documentation
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));


    // Initializing routes
    app.use("/api/user", userRoute);
    app.use("/api/monitor", monitorRoute);
    app.use("/api/admin", monitorRoute);

    // Start the server
    app.listen(8080, () => {
      console.log("Server running on port 8080");
    });
  } catch (error) {
    console.error("Error starting the server:", error);
  }
}

// Start the server
startServer();
