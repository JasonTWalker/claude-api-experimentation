import { streamMessage } from "./claude-client-handling-streaming.js"; 
import { ClaudeClient } from "./claude-client.js";
import type { CreateMessageRequest } from './types.js';
import "dotenv/config"

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing from .env");


const cClient = new ClaudeClient(apiKey);

const request: CreateMessageRequest = {
  model: "claude-haiku-4-5-20251001",
  max_tokens: 512,
  messages: [{ role: "user", content: "In 2 short paragraps explain the benfits of streaming." }],
};


// note: still waits for the full message, just displays as it arrives
// useful for chatbot/ text interactions giving user response asap
for await (const text of streamMessage(cClient, request)) {
  process.stdout.write(text); // Or append the fragment to a UI
  // ^ console.log() prints each fragment to a newline
}


