const Monitor = require("../models/Monitor");
const UptimeEvent = require("../models/UptimeEvent");
const axios = require("axios");
const mongoose = require('mongoose');
const monitorAgentUrls = require('../monitorAgentUrls');
const Alert = require('../models/Alert');

const createAxiosInstance = axios.create({
  // Disable retries
  retries: 1,
  retryDelay: 0,
  retryCondition: () => false,

  // Set a lower timeout value (e.g., 5 seconds)
  timeout: 5000,
});


let currentUrlIndex = 0; // Keep track of the current URL index
mongoose.set('useFindAndModify', false);


const performCronJob5 = async () => {
    console.log("running cronJob for 1 minute jobs")
  try {
    // Define pagination parameters
    const pageSize = 100; // Number of monitors to retrieve per page
    let currentPage = 1; // Current page

    let monitors;
    let hasMoreMonitors = true;

    // Loop through the pages until all monitors are processed
    while (hasMoreMonitors) {
      monitors = await Monitor.find({
        frequency: 1,
        updatedAt: { $lte: new Date(Date.now() - 45 * 1000) },
        isPaused: false
      }).populate('user');
       
      
      
      console.log(monitors?.length + "monitors found")


      // Check if there are more monitors beyond the current page
      if (monitors.length < pageSize) {
        hasMoreMonitors = false;
      }

      // Create an array of promises for each monitor API call
      const monitorPromises = monitors.map(async (monitor) => {
        const { url, port, user,type } = monitor;

        // Select the URL based on the current index using the round-robin algorithm
        const selectedUrl = monitorAgentUrls[currentUrlIndex].url;

        // Update the current URL index for the next iteration
        currentUrlIndex = (currentUrlIndex + 1) % monitorAgentUrls.length;

        // Create a timer to measure the response time
        const startTimestamp = new Date().getTime();


        // Call the monitor agent API with the monitor information
        let response;
        try {
          response = await createAxiosInstance.post(selectedUrl, {
            url,
            port,
            type,
            token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" // Replace with your authentication token
          });
        } catch (error) {
          console.error("Error in monitor request:", error);
          // Find a different monitor agent URL
          const differentAgentUrl = monitorAgentUrls.find(
            (urlObj) => urlObj.url !== selectedUrl
          );

          if (differentAgentUrl) {
            try {
              response = await createAxiosInstance.post(differentAgentUrl.url, {
                url,
                port,
                type,
                token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" // Replace with your authentication token
              });
            } catch (error) {
              console.error("Error in alternative monitor request:", error);
              // Handle the error or take appropriate action
              // For example, you can set the availability to "Unknown"
              return;
            }
          } else {
            console.error("No alternative monitor agent URL available");
            // Handle the error or take appropriate action
            // For example, you can set the availability to "Unknown"
            return;
          }
        }


        // Calculate the response time
        const endTimestamp = new Date().getTime();
        const responseTime = endTimestamp - startTimestamp;

         
        // Extract the relevant data from the monitor agent response
      
        let availability = response?.data?.availability || null;
        let ping = response?.data?.ping || null;
        let portResult = response?.data?.port || null;

        console.log(availability,ping,portResult)

        let uptimeEvent;
        // Create a new uptime event with the obtained data
          uptimeEvent = new UptimeEvent({
          monitor: mongoose.Types.ObjectId(monitor._id),
          timestamp: new Date(),
          availability: availability === "Up" ? "Up" : "Down",
          ping: ping === "Reachable" ? "Reachable" : "Unreachable",
          port: portResult === "Open" ? "Open" : "Closed",
          responseTime: responseTime, // Set the response time if available,
          confirmedByAgent: response?.config?.url // Set the URL that did the job
        });
        
        // Verify the URL using another monitor agent if it is down
        if (availability === "Down" || ping === "Unreachable" || port === "Closed") {
          // Find a different monitor agent URL
          const differentAgentUrl = monitorAgentUrls.find(
            (urlObj) => urlObj.url !== selectedUrl
          );

          if (differentAgentUrl) {
            try {
              // Call the different monitor agent API with the monitor information
              const verifyResponse = await createAxiosInstance.post(
                differentAgentUrl.url,
                {
                  url,
                  port,
                  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" // Replace with your authentication token
                }
              );

              // Extract the relevant data from the verification response
              const { availability: verifyAvailability } = verifyResponse.data;
              console.log("Verification availability:", verifyAvailability);

              // Update the availability in the uptime event based on the verification result
              uptimeEvent.availability = verifyAvailability === "Up" ? "Up" : "Down";
              uptimeEvent.confirmedByAgent = differentAgentUrl.url; // Set the URL that did the verification
            } catch (error) {
              console.error("Error in verification request:", error);
            }
          }
        }
        //console.log(uptimeEvent,type)
        if(type === "web" && uptimeEvent.availability === "Down"){
          console.log("web alert")
          const email = monitor?.user?.email
          const error = `${url} Website is down`
          sendAlert(email,error)
        }

        if(type === "ping" && uptimeEvent.ping === "Unreachable"){
          console.log("ping alert")
          const email = monitor?.user?.email
          const error = `${url} ping is unreachable`
          sendAlert(email,error)
        }

        if(type === "port" && uptimeEvent.port === "Closed"){
          console.log("port alert")
          const email = monitor?.user?.email
          const error = `${url} port is closed`
          sendAlert(email,error)
        }

        // Save the uptime event to the database
        await uptimeEvent.save();


       // Update the 'updatedAt' field of the corresponding monitor
        await Monitor.findByIdAndUpdate(monitor._id, { updatedAt: new Date() });
      });
    
      // Run all the monitor promises concurrently
      await Promise.all(monitorPromises);

      currentPage++;
    }

    console.log("Cron job executed successfully");
  } catch (error) {
    console.error("Error executing cron job:", error);
  }
};

const sendAlert = (email,error)=>{
  const newAlert = new Alert({
    message: error,
    email: email,
  });
  
  newAlert.save()
    .then((alert) => {
      console.log('Alert saved:', alert);
    })
    .catch((error) => {
      console.error('Error saving alert:', error);
    });
}

module.exports = performCronJob5;
