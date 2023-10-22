const Monitor = require("../models/Monitor");
const UptimeEvent = require("../models/UptimeEvent");
const axios = require("axios");
const mongoose = require('mongoose');
const MonitorAgent = require('../models/MonitorAgent'); 
const Alert = require('../models/Alert');

const createAxiosInstance = axios.create({
  // Disable retries
  retries: 3,
  retryDelay: 1000,
  retryCondition: () => false,

  // Set a lower timeout value (e.g., 5 seconds)
  timeout: 5000,
});


let currentUrlIndex = 0; // Keep track of the current URL index
mongoose.set('useFindAndModify', false);


const performCronJob60 = async () => {
    console.log("running cronJob for 60 minute jobs")
  try {
     // Fetch monitor URLs from the database
     const monitorUrlsFromDB = await MonitorAgent.find({type:"monitorAgents"});

     // Check if there are monitor URLs in the database
     if (monitorUrlsFromDB.length === 0) {
         console.error("No monitor URLs found in the database.");
         return;
     }

     //console.log(monitorUrlsFromDB)
    // Define pagination parameters
    const pageSize = 100; // Number of monitors to retrieve per page
    let currentPage = 1; // Current page

    let monitors;
    let hasMoreMonitors = true;

    // Loop through the pages until all monitors are processed
    while (hasMoreMonitors) {
      monitors = await Monitor.find({
        frequency: 60,
        updatedAt: { $lte: new Date(Date.now() - 60 * 60 * 1000) },
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

         // Retrieve the last recorded uptime status for the monitor
          const lastUptimeEvent = await UptimeEvent.findOne({
             monitor: monitor._id,
          }).sort({ timestamp: -1 });

          let lastUptimeStatus;

           if(type === "web"){
            
             lastUptimeStatus = lastUptimeEvent?.availability || "Unknown";
           }else if(type === "ping"){
            lastUptimeStatus = lastUptimeEvent?.ping || "Unknown";
           }else if(type === "port"){
            
            lastUptimeStatus = lastUptimeEvent?.port || "Unknown";
           }else{
             lastUptimeStatus = "unkown"
           }


         


        // Select the URL based on the current index using the round-robin algorithm
        const selectedUrl = monitorUrlsFromDB[currentUrlIndex].url;

        // Update the current URL index for the next iteration
        currentUrlIndex = (currentUrlIndex + 1) % monitorUrlsFromDB.length;

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
          const differentAgentUrl = monitorUrlsFromDB.find(
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

        //console.log(response)


        // Calculate the response time
        const endTimestamp = new Date().getTime();
        const responseTime = endTimestamp - startTimestamp;

         
        // Extract the relevant data from the monitor agent response

        let save;
      
        let availability = response?.data?.availability || null;
        let ping = response?.data?.ping || null;
        let portResult = response?.data?.port || null;

        console.log(availability,ping,portResult)
        
        if(type === "web"){
          availability === lastUptimeStatus ? save = false : save = true;
        }else if(type === "ping"){
          ping === lastUptimeStatus ? save = false : save = true;
        }else{
          portResult === lastUptimeStatus ? save = false : save = true;
        }
        

        let uptimeEvent;

        
        // Create a new uptime event with the obtained data
          uptimeEvent = new UptimeEvent({
          monitor: mongoose.Types.ObjectId(monitor._id),
          userId: monitor.user,
          timestamp: new Date(),
          type:monitor.type,
          reason:monitor.type === "web" ? response?.data?.data?.status : response?.data?.data?.output, 
          availability: availability === "Up" ? "Up" : "Down",
          ping: ping === "Reachable" ? "Reachable" : "Unreachable",
          port: portResult === "Open" ? "Open" : "Closed",
          responseTime: responseTime, // Set the response time if available,
          confirmedByAgent: response?.config?.url // Set the URL that did the job
         });
       
        
        // Verify the URL using another monitor agent if it is down
        if (availability === "Down" || ping === "Unreachable" || port === "Closed") {
          // Find a different monitor agent URL
          const differentAgentUrl = monitorUrlsFromDB.find(
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
        if(type === "web" && uptimeEvent?.availability === "Down"){
          console.log("web alert")
          const userId = monitor?.user?._id
          const id = monitor?._id
          sendAlert(userId,url,id)
        }

        if(type === "ping" && uptimeEvent?.ping === "Unreachable"){
          console.log("ping alert")
          const userId = monitor?.user?._id
          const id = monitor?._id
          sendAlert(userId,url,id)
        }

        if(type === "port" && uptimeEvent?.port === "Closed"){
          console.log("port alert")
          const userId = monitor?.user?._id
          const id = monitor?._id
          sendAlert(userId,url,id)
        }

        if(save === true){
        // Save the uptime event to the database
        await uptimeEvent.save();
        }

        if (save === true) {
          lastUptimeEvent.endTime = new Date(); // Set the end time to the current timestamp
          await lastUptimeEvent.save(); // Save the updated uptime event
        }
        

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

const sendAlert = async (userId,url,id) => {
  const monitor = await Monitor.findById(id);
  //console.log(monitor);

  if (!monitor) {
    console.error(`Monitor with ID ${id} not found`);
    return;
  }

  // Get the last alert time from the monitor's data
  const lastAlertSentAt = monitor?.lastAlertSentAt || null;
  // Get the alert frequency from the monitor's data
  const alertFrequency = monitor.alertFrequency || 1; // Default to 1 if not set

  // Get the current time
  const currentTime = new Date();

  // Calculate the time difference between the current time and the last alert time
  const timeDifference = lastAlertSentAt ? currentTime - lastAlertSentAt : Infinity;

  if(!userId){
    return;
  }

  // Check if enough time has passed based on the alert frequency
  if (timeDifference >= alertFrequency * 60 * 1000) {
    
    const newAlert = new Alert({
      userId:userId,
      monitorId:id,
      url:url,
    });

    // Update the last alert time for the monitor
    monitor.lastAlertSentAt = currentTime;
    await monitor.save();

    newAlert.save()
      .then((alert) => {
        console.log('Alert saved:', alert);
      })
      .catch((error) => {
        console.error('Error saving alert:', error);
      });

  } else {
    console.log(`Not enough time has passed for monitor ID ${id}`);
  }
};


module.exports = performCronJob60;
