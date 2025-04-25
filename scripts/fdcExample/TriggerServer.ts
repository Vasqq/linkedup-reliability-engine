import express, { Request, Response } from 'express';
import { exec } from 'child_process'; // Node.js module to run shell commands
import * as path from 'path'; // To construct path to script

const app = express();
const port = 3000; // Choose a port for your local server

// --- Configuration ---
// Adjust the path if your script is located differently relative to trigger-server.ts
const hardhatScriptPath = path.join(__dirname, 'JsonApi.ts');
// Construct the command exactly as you run it manually
const hardhatCommand = `npx hardhat run ${hardhatScriptPath} --network coston2`;
// --- End Configuration ---


let isProcessing = false; // Flag to prevent simultaneous runs

// Middleware to parse JSON bodies (though we might not need it for a simple trigger)
app.use(express.json());

// Define the trigger endpoint
app.post('/trigger-reputation-update', (req: Request, res: Response) => {
  console.log(`[${new Date().toISOString()}] Received trigger request.`);

  if (isProcessing) {
    console.log('--> Already processing, request ignored.');
    // 429 Too Many Requests or 503 Service Unavailable are appropriate
    return res.status(429).send('Processing already in progress.');
  }

  isProcessing = true;
  console.log(`--> Starting Hardhat script: ${hardhatCommand}`);

  // Immediately send a response to the Cloud Function saying "Accepted"
  // The Cloud Function doesn't need to wait for the whole script to finish.
  res.status(202).send('Accepted: Reputation update process started.');

  // Execute the Hardhat script as a child process
  exec(hardhatCommand, (error, stdout, stderr) => {
    const finishTime = new Date().toISOString();
    console.log(`[${finishTime}] Hardhat script execution finished.`);

    if (error) {
      console.error(`--> Script execution ERROR: ${error.message}`);
      // You might want more robust error handling/alerting here
    }
    if (stderr) {
      console.error(`--> Script STDERR:\n${stderr}`);
    }
    if (stdout) {
      console.log(`--> Script STDOUT:\n${stdout}`);
    }

    // IMPORTANT: Reset the flag allowing the next run
    isProcessing = false;
    console.log('--> Processing flag reset.');
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Reputation trigger server listening on http://localhost:${port}`);
  console.log(`Waiting for POST requests to /trigger-reputation-update`);
});