const http = require('http');
const webhookHandler = require('./api/webhook');

const PORT = process.env.PORT || 8080;

const server = http.createServer(async (req, res) => {
  // Health check endpoint
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Webhook endpoint
  if (req.url === '/api/webhook' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const mockReq = {
          method: 'POST',
          body: JSON.parse(body)
        };
        
        const mockRes = {
          status: (code) => ({
            json: (data) => {
              res.writeHead(code, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
            }
          })
        };
        
        await webhookHandler(mockReq, mockRes);
      } catch (error) {
        console.error('Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    
    return;
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
