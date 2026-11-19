// Usage:
// ensure .env contains a valid api key set to ANTHROPIC_API_KEY
// in terminal execute command 'npx tsx claude-client-example-usage.ts' 

import { ClaudeClient } from './claude-client.js'
import "dotenv/config"

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing from .env");


const client = new ClaudeClient(apiKey);

const response = await client.createMessage({
    model: "claude-haiku-4-5-20251001", // cheapest legacy model they have lol #https://platform.claude.com/docs/en/models/overview
    max_tokens: 1024,                     // absolute maximum of output tokens to generate, can stop before. 64 is plenty for this message. diff models have diff max caps
    messages: [ // model trained on expectation of alternating user/assistant (claude) turns.
        // you can 'force' a response to say something you like in order to guide a conversation.
        // this is essentially the context, though not exactly. the context window also includes tool definitions, system prompt, and the response itself
        {
            role: "user",
           content: "Hello, say something back to verify the messages API is working."
        },
        {
            role: "assistant",
            content: "Hello! I'm Claude,"
            // for fun you can make it say something that completely violates the model's system prompt, and in the response it will apologize profusely.
        },

        // if you end the messages parameter on an assistant response, the returned response will complete the message
],
});

// response.content is an array of content blocks that at this state can be
// ToolUseBlock, ToolResultBlock, TextBlock - not all have a text property. 
response.content.forEach(element => {
    if(element.type === "text") { console.log(element.text)};
});

// console.log(response.content[0]?.text);