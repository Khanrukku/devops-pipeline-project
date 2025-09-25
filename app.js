const express = require('express');
const app = express();
const port = 3000;

// Main page
app.get('/', (req, res) => {
  res.json({ 
    message: 'Hello from DevOps Pipeline!', 
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
    environment: 'production'
  });
});

// Health check page (important for AWS)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Start the server
app.listen(port, () => {
  console.log(`App running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});