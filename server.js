// Import necessary modules
import 'dotenv/config'; // Load .env file immediately
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

// Initialize the Express app
const app = express();
const PORT = 3000;

// --- Middleware ---
// Enable CORS for all routes (to allow frontend access)
app.use(cors());
// Parse JSON request bodies
app.use(express.json());

// --- API Endpoint: /api/chat ---
app.post('/api/chat', async (req, res) => {
  const { messages, provider } = req.body;

  let apiUrl, apiKey, apiModel;

  // This 'switch' block is a clean way to implement the
  // Open/Closed Principle. We can add new providers
  // without modifying the core streaming logic.
  switch (provider) {
    case 'openrouter':
      apiUrl = process.env.OPENROUTER_URL;
      apiKey = process.env.OPENROUTER_API_KEY;
      apiModel = process.env.OPENROUTER_MODEL;
      break;
    case 'aimlapi':
      apiUrl = process.env.AIMLAPI_URL;
      apiKey = process.env.AIMLAPI_KEY;
      apiModel = process.env.AIMLAPI_MODEL;
      break;
    default:
      return res.status(400).json({ error: 'Invalid provider specified.' });
  }

  // Log the request for debugging (using structured logging)
  console.log(JSON.stringify({
    level: "info",
    timestamp: new Date().toISOString(),
    provider: provider,
    model: apiModel,
    messageCount: messages.length
  }));

  try {
    // 1. Make the streaming request to the target AI provider
    const aiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: apiModel,
        messages: messages,
        stream: true, // Enable streaming
      }),
    });

    // 2. Check for API errors
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(JSON.stringify({ level: "error", provider: provider, status: aiResponse.status, body: errorText }));
      return res.status(aiResponse.status).send(errorText);
    }

    // 3. Set headers for our client-facing stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 4. Proxy the stream: Read from AI provider, write to our client
    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break; // Stream finished
      }

      // Decode the chunk
      const chunk = decoder.decode(value, { stream: true });
      
      // The AI providers send Server-Sent Events (SSE)
      // We must parse them to extract the content 'delta'
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

      for (const line of lines) {
        const message = line.replace(/^data: /, '');
        if (message === '[DONE]') {
          continue; // End of stream signal from OpenAI standard
        }

        try {
          const json = JSON.parse(message);
          const token = json.choices[0]?.delta?.content;

          if (token) {
            // Write *only* the token to our client stream
            res.write(token);
          }
        } catch (error) {
          // Ignore parse errors (e.g., incomplete JSON chunks)
        }
      }
    }

  } catch (error) {
    console.error(JSON.stringify({ level: "critical", error: error.message, stack: error.stack }));
    res.status(500).json({ error: 'Failed to connect to AI service.' });
  } finally {
    // 5. End the client response stream
    res.end();
  }
});

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});