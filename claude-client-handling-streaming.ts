// worth noting this may be better suited to the SDK, but it can be done in API for more fine-tuned control
// the API handles this as SSEs or Server Sent Events

import { ClaudeClient } from './claude-client.js';
import type { CreateMessageRequest } from './types.js';


async function* streamMessage(  //function* denotes a generator function, asynchronous production
    client: ClaudeClient,
    req: CreateMessageRequest
): AsyncGenerator<string> {     // async generator yields string values as they come
    const res = await fetch(`${client["baseUrl"]}/messages`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-api-key": client["apiKey"],
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ ...req, stream: true})   // set stream to true to enable streaming
        // may have to assemble the complete message at the end when not using sdk
        // ...req assembles request fields into a new object
    })

    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);

    const reader = res.body!.getReader(); // locks a reader to the stream, process incoming data as it arrives
    const decoder = new TextDecoder();    //  convrts network byte data into text      
    let buffer = "";                      // holds currently processed data that may not yet be finished

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;        // if 'done' then stream is finished
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");   
        buffer = lines.pop() ?? "";

    for (const line of lines) {
        if (!line.startsWith("data:")) continue;    // skip lines that aren't SSE data: 
        const data = JSON.parse(line.replace("data:", "").trim()); // remove data prefix, parse as jsom
        
        // data.type refers to event type: 
        // #https://platform.claude.com/docs/en/managed-agents/event-deltas
        if (data.type === "content_block_delta" && data.delta?.text) { // keep only events that contain text fragment
            yield data.delta.text;  // shows the text to the function caller
            // paused until the next value is requested
        } 
    }
  }
}

export { streamMessage }