// Usage:
// ensure .env contains a valid api key set to ANTHROPIC_API_KEY
// in terminal execute command 'npx tsx claude-client-example-usage.ts' 

import { ClaudeClient } from './claude-client.js'
import { runWithTools } from './claude-client-tool-usage.js';
import type { CreateMessageRequest, ToolDefinition } from './types.js';
import "dotenv/config"

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing from .env");

const claudeClient = new ClaudeClient(apiKey);


// define a tool
const getTime: ToolDefinition = {               // model only ever sees name, description and input_schema
    // decides when to call the tool from the description
    name: "get_time",
    description: "Returns the current date and time as an ISO 8601 string.",
    input_schema: { type: "object", properties: {} },       // properties {} signifies the tool takes no arguments
};


// define the handler for the tool
const handlers = {
    get_time: async () => new Date().toISOString(),
};


// define a request
const request: CreateMessageRequest = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    tools: [getTime],
    messages:
    [
        { 
            role: "user", content: "What is the time?"
        }
    ],
};

// // try/catch as we expect this run to fail - due to handler being undefined
// try {
//     const response = await runWithTools(claudeClient, request, handlers);
//     console.log("Final response: " + response);
//     console.log("Stop reason: " + response.stop_reason)
// } catch (err) {
//     console.log("Run failed w/ error: " + err);
// }

const response = await runWithTools(claudeClient, request, handlers);
console.log("stop_reason:", response.stop_reason);
console.log(response)