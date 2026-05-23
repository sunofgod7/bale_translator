const webhookHandler = require('./api/webhook');

exports.handler = async (event) => {
  try {
    // Parse the incoming request
    const body = event.body ? JSON.parse(event.body) : {};
    
    // Create mock request and response objects
    const mockReq = {
      method: event.httpMethod || 'POST',
      body: body
    };
    
    let responseData = null;
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          responseData = {
            statusCode: code,
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
          };
        }
      })
    };
    
    // Call the webhook handler
    await webhookHandler(mockReq, mockRes);
    
    // Return the response
    return responseData || {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ok: true })
    };
    
  } catch (error) {
    console.error('Lambda error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
