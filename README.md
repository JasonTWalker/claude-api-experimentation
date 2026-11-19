# Claude API Experimentation (messages)
To experiment with the Anthropic messages API in preparation for the Claude Certified Developer: Foundations exam. Also for fun really.
The goal is to build a custom TypeScript library for interacting with the messages API. There are other ways of doing this, particularly with the Claude SDK - but the aim is to hopefully gain a lower level understanding of what's going on under the hood.

## Resources
The project follows this guide for initial setup: 
- https://subtoapi.app/blog/claude-api-typescript-client-library-setup

Anthropic Documentation for API:
- https://platform.claude.com/docs/en/api/overview
  - For the most part this project will focus on messages API but there are others available
 
Messages API Parameters:
- https://platform.claude.com/docs/en/api/typescript/messages/create
  - Custom interfaces defined in ./types.ts use this structure, only 'messages', 'model' and 'max_tokens' are required fields.
  - If there is a parameter you want to try, add it to the CreateMessageRequest interface, then define it when you create a new message request.

Event Deltas:
- https://platform.claude.com/docs/en/build-with-claude/streaming
  - Of different types containing different information.
  - Examples of type "event_delta" with "content_delta" with "content" of type "text"


<hr>

### Usage Journey

#### Raw Fetch API Wrapper 

<details> <summary> Show RAW HTTP API Usage Journey - Up to Tool Usage (WARNING: LONG RAMBLINGS) </summary>

#### Basic Messages API Usage

<details><summary> Show details </summary>


<details> <summary> Show Basic Usage Example Code </summary>

 ```
 
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

response.content.forEach(element => {
    console.log(element.text)
});

```

</details>

Executing the above returned the following response:
- '  an AI assistant made by Anthropic. The messages API is working—I received your message and I'm responding to it now. How can I help you today?'

DO note that the model is non-deterministic, so the output will not always be identical to this, though should be similar. As the request messages ended on an assistant turn, the response finishes this turn - you can see this from the whitespace at the start of the response, caused by the assistant content ending on a comma. It's worth noting that even this leading whitespace wasn't consistently returned after sending this same request multiple times.

</details>

<hr>

#### Using Streams with Messages API
Streams are a way to process responses as they are sent over the Network, this is favourable for situations like Chat UIs and human-facing applications where you don't want to leave the user awaiting a response. Long responses are also useful, as it prevents the request hitting HTTP timeouts by breaking it up. 
However when we start implementing tool_use loops it's not worth it as agentic loops only act on blocks once they're complete. For short responses the latency saving isn't worth introducing extra failure points either. The stream: true flag changes how the server delivers the response, from a single 'Message' object as the body shape to a sequence of SSE events. 

The following implementation is quite simple, and there are things to consider that will be covered. 

<details><summary> Show Code </summary>

Define the asynchronous generator function:

```
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

```

Use it with ClaudeClient class and a structured MessageRequest

```

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
```

</details>

The primary issue with this is that it only 'cares' about content_block_delta. See resources above for more information on deltas. The error validation only checks the json response code, if it fails midway through stream there is no way of knowing, the existing output will be presented as complete, stop_reason is discarded. 

Missing events include:
- message_start, losing input token ussage, message id, and the model used
- message_delta, losing stop_reason and output token usage
- error, losing mid-stream failure reasons
- content_block_start/stop, losing block boundaries required for tool use
- non-text-deltas, such as input_json_delta, thinking_delta as they have no .text field


<hr>

#### Claude Messages API w/ Tool Usage

For the exploration in this, the descriptions from the guide I was following started to fall off and leant more towards pushing their API that they wanted to sell. The next few implementations have been build with the help of Claude chat, using my GitHub repository as a resource in the Project context for the chats.


<details> <summary> Show changes </summary>

  
Let's cover the changes so far:

- Updated type ContentBlock to be either TextBlock, ToolUseBlock or ToolResultBlock and defined what these block types should look like.

```
type TextBlock = { type: "text"; text: string};

type ToolUseBlock = {     // sent by the "assistant", identifying the tool to use and inputs
  type: "tool_use"; id: string; name: string; input: Record<string, unknown> 
}

type ToolResultBlock = {  // sent by the "user", after assistant ToolUseBlock, identifying the result of the tool use block
 type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean;
};

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

```
- Updated StopReason and corresponding field in MessageResponse to use them, as there are now more failure points as we move away from pure text-based API calls.

```
type StopReason =   | "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "pause_turn" | "refusal";

interface MessageResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ContentBlock[];
  model: string;
  stop_reason: StopReason | null;   // now references type StopReason
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
```

- As content field within MessageResponse above can now contain multiple types of ContentBlock; TextBlock or ToolUseBlock etc, we need to update our original Claude Client Example Usage:

```
response.content.forEach(element => {
    console.log(element.text)
});

```

Becomes:
```
response.content.forEach(element => {
    if(element.type === "text") { console.log(element.text)};
});
```

As ToolUseBlocks do not contain a text field.

</details>


<details> <summary> Show Tool Use Loop Implementation</summary>

Now we have defined our new ContentBlock types, it's time to use them. 


Loop definition:

```
import { ClaudeClient } from './claude-client.js';
import type { CreateMessageRequest, MessageResponse, MessageParam } from './types.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<string>; 

async function runWithTools(
    client: ClaudeClient,
    req: CreateMessageRequest,              // model, max_toks, messages - also holds an array of ToolDefinition[] as tools
    handlers: Record<string, ToolHandler>,  // map a tool name to the function that runs it, tools live in req.tools ^^
    maxTurns = 10,                          // hard cap so a loop without a define stop doesn't burn tokens
): Promise<MessageResponse> {
    const messages: MessageParam[] = [...req.messages];     // copies array so loop can append to it without mutation - tool responses must be unmuted

    for (let turn = 0; turn < maxTurns; turn++) {
        const res = client.createMessage({...req, messages});   // copies original settings and messages, overrides old list
        if ((await res).stop_reason !== "tool_use") {           // anything other than tool use = model has no requests, end loop
            return res;
        }

        // record the assistant's turn
        messages.push( {role: "assistant", content: (await res).content})
        console.log(JSON.stringify(messages, null, 2))  // null replacer, 2 indentation 
    }

    throw new Error(`Tool loop exceeded ${maxTurns} turns`);
}

export { runWithTools };
```

Our example defined tool will be getTime, which ideally should return the current time formatted as an ISO 8601 string. The following implementation will return an error, as our handler (which maps a tool to the function that produces the result) is currently nonexistent - as such there will be no required ToolResultBlock produced by the 'user'. 

- Define our tool and the request that will use it:

```
// define a tool
const getTime: ToolDefinition = {               // model only ever sees name, description and input_schema
    // decides when to call the tool from the description
    name: "get_time",
    description: "Returns the current date and time as an ISO 8601 string.",
    input_schema: { type: "object", properties: {} },       // properties {} signifies the tool takes no arguments
};

// empty handler
const handlers = {};


// define a request
const request: CreateMessageRequest = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    tools: [getTime],
    messages:
    [
        { 
            role: "user", content: "What's the current time?" 
        }
    ],
};

```

- Try/Catch block so we can see our error:

```
// try/catch as we expect this run to fail - due to 
try {
    const response = await runWithTools(claudeClient, request, handlers);
    console.log("FInal response: " + response);
} catch (err) {
    console.log("Run failed w/ error: " + err);
}
  ```


- Console Output On Execution:

```
  
$ npx tsx claude-client-tool-usage-example-usage.ts
[      // from our console.log in runWithTools loop, showing our messages
  {
    "role": "user",
    "content": "What's the current time?"
  },
  {
    "role": "assistant",
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_01HvryQmArDHidNdWgGcksLS",
        "name": "get_time",
        "input": {},
        "caller": {
          "type": "direct"
        }
      }
    ]
  }
]
Run failed w/ error: Error: Claude API error 400: {"type":"error","error":{"type":"invalid_request_error","message":"messages.1: `tool_use` ids were found without `tool_result` blocks immediately after: toolu_01HvryQmArDHidNdWgGcksLS. Each `tool_use` block must have a corresponding `tool_result` block in the next message."},"request_id":"req_011ChCEkkumbix7UvhCnxLMQ"}
  
  ```

As you can see, we fail because we haven't defined a corresponding tool_result for our getTime tool - we will do this next.


- Update runWIthTools to include a section to store the results of tool usage, and format as a user response.

```
async function runWithTools(
    client: ClaudeClient,
    req: CreateMessageRequest,              // model, max_toks, messages - also holds an array of ToolDefinition[] as tools
    handlers: Record<string, ToolHandler>,  // map a tool name to the function that runs it, tools live in req.tools ^^
    maxTurns = 10,                          // hard cap so a loop without a define stop doesn't burn tokens
): Promise<MessageResponse> {
    const messages: MessageParam[] = [...req.messages];     // copies array so loop can append to it without mutation - tool responses must be unmuted

    for (let turn = 0; turn < maxTurns; turn++) {
        const res = client.createMessage({...req, messages});   // copies original settings and messages, overrides old list
        if ((await res).stop_reason !== "tool_use") {           // anything other than tool use = model has no requests, end loop
            return res;
        }

        // record the assistant's turn
        messages.push( {role: "assistant", content: (await res).content})

        console.log(JSON.stringify(messages, null, 2))  // null replacer, 2 indentation 
##########################################################################################################################
        const results: ToolResultBlock[] = []; // store the results of our tool usage
        for (const block of (await res).content) {
            if (block.type !== "tool_use") continue;    // if text or otherwise, skip
            const handler = handlers[block.name]; // match handler to the used tool

            try {
                if (!handler) throw new Error(`Unknown Tool: ${block.name}`);   //if handler to match tool doesnt exist, throw error
                results.push( { type: "tool_result", tool_use_id: block.id, content: await handler(block.input) });
            } catch (err) {     // if error occured add as user message with is_error true, //error message defined above of unknown tool
                results.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: err instanceof Error ? err.message : String(err),
                    is_error: true
                })
            }
        }
        // add tool result block as a message from user
        messages.push( {role: "user", content: results})
        // log the now updated messages with the tool response block from the user
        console.log(JSON.stringify(messages, null, 2));
##########################################################################################################################    
    }

    throw new Error(`Tool loop exceeded ${maxTurns} turns`);
```

- Now the output from running the script doesn't directly error consistently, though sometimes it will retry the tool and we can see the issue:
```
  {
    "role": "user",
    "content": "What's the current time?"
  },
  {
    "role": "assistant",
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_01SjxL2bof5ZAKyxfhZVyRUS",
        "name": "get_time",
        "input": {},
        "caller": {
          "type": "direct"
        }
      }
    ]
  },
  {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01SjxL2bof5ZAKyxfhZVyRUS",
        "content": "Unknown Tool: get_time",
        "is_error": true
      }
    ]
  },
  {
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "I apologize for the error. It seems there's an issue accessing the time tool. Let me try again:"
      },
      {
        "type": "tool_use",
        "id": "toolu_01PWV2GssiXMYHFzeEZSt7JE",
        "name": "get_time",
        "input": {},
        "caller": {
          "type": "direct"
        }
      }
    ]
  }
]
Final response: [object Object]
```
We can see that the is_error flag on the message is set to true, with the text content on the message relating to it. This is still due to our handler not having a defined ToolUseBlock to provide - so let's implement that.

```
const handlers = {
    get_time: async () => new Date().toISOString(),
};
```

Let's also change the way we show the response, by logging it directly:

```
const response = await runWithTools(claudeClient, request, handlers);
console.log("stop_reason:", response.stop_reason);
console.log(response)
```

We get this output: 

```
stop_reason: end_turn
{
  model: 'claude-haiku-4-5-20251001',
  id: 'msg_011ChCQuzUkfzWgr4g9S48HY',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: 'The current time is **14:04:28 UTC** on **November 19, 2026** (2:04 PM and 28 seconds).'
    }
  ],
  container: null,
  stop_reason: 'end_turn',
  stop_sequence: null,
  stop_details: null,
  usage: {
    input_tokens: 620,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
    output_tokens: 38,
    service_tier: 'standard',
    inference_geo: 'not_available',
    speed: 'standard'
  },
  diagnostics: null
}
```

With the Messages chain looking like this:

```
[
  {
    "role": "user",
    "content": "What is the time?"
  },
  {
    "role": "assistant",
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_01SbPnZyMRibyjTHqzbvEx4a",
        "name": "get_time",
        "input": {},
        "caller": {
          "type": "direct"
        }
      }
    ]
  },
  {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01SbPnZyMRibyjTHqzbvEx4a",
        "content": "2026-11-19T14:04:28.367Z"
      }
    ]
  }
]
```

</details>

We have defined a tool getTime that takes no real arguments, it just returns the current time. Let's have a look at what a tool with arguments looks like - Claude suggested an example 'divide', which opens up potential failure cases where divide by 0 is requested. No point covering all the stuff prior, you can expand that if you want a more detailed breakdown of how the tool use loop is applied.

<details><summary> Show divide_two_numbers tool definition and usage </summary>

- Define the divide_two_numbers tool:
```
const divideTwoNumbers: ToolDefinition = {               // model only ever sees name, description and input_schema
    name: "divide_two_numbers",
    description: "Divide one number by another.",
    input_schema: { 
        type: "object", 
        properties: {                                   // tool takes 2 arguments
            a: {type: "number", description: "The dividend" },
            b: { type: "number", description: "The divisor" },
        },
        required: ["a", "b"]                            // arguments are required as part of the schema
    }, 
}     

```
Note the change to input_schema, both a and b are required, and the model determines what these values should be.

- Define the handler for the tool:
  
```
const handlers = {
    divide_two_numbers: async (input) => {
        const { a, b } = input;
        if (typeof a !== "number" || typeof b !== "number") {
            throw new Error("a and b must be numbers");
        }
        if (b === 0) throw new Error("Cannot divide by zero");
        return String(a / b);
    },
};
```
As you can see, we have defined cases in which the tool errors out.

- Define the Message Request:
```
const divideRequest: CreateMessageRequest = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    tools: [divideTwoNumbers],
    messages:
    [
        { 
            role: "user", content: "What 5 divided by 2?"
        }
    ],
};
```

- Executing the script and logging the messages chain and response:
```
[
  {
    "role": "user",
    "content": "What 5 divided by 2?"
  },
  {
    "role": "assistant",
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_016bQFpBKo3ziQdqaq5USFtJ",
        "name": "divide_two_numbers",
        "input": {
          "a": 5,
          "b": 2
        },
        "caller": {
          "type": "direct"
        }
      }
    ]
  },
  {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_016bQFpBKo3ziQdqaq5USFtJ",
        "content": "2.5"
      }
    ]
  }
]
stop_reason: end_turn
{
  model: 'claude-haiku-4-5-20251001',
  id: 'msg_011ChCXQPhjsUfaPgzBv4Wni',
  type: 'message',
  role: 'assistant',
  content: [ { type: 'text', text: '5 divided by 2 equals **2.5**.' } ],
  container: null,
  stop_reason: 'end_turn',
  stop_sequence: null,
  stop_details: null,
  usage: {
    input_tokens: 684,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
    output_tokens: 16,
    service_tier: 'standard',
    inference_geo: 'not_available',
    speed: 'standard'
  },
  diagnostics: null
}
```
We can see our tool call and response.

</details>

IT is worth nothing that the model has some agency over when to call the tool. As "a" and "b" are designated as required fields, if we ask 

"What is 5 divided by ?"

IT never calls the tool in the first place, so it doesn't error out.

<details> <summary> show response chain </summary>

  ```
[
  {
    "role": "user",
    "content": "What 5 divided by ?"
  }
]
stop_reason: end_turn
{
  model: 'claude-haiku-4-5-20251001',
  id: 'msg_011ChCXuJNKQoU1Y4LFd3FwG',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: `I'd be happy to help you with division! However, your question "What 5 divided by ?" is incomplete. \n` +
        '\n' +
        'Could you please provide the divisor (the number you want to divide 5 by)? For example:\n' +
        '- 5 divided by 2?\n' +
        '- 5 divided by 10?\n' +
        '- 5 divided by some other number?\n' +
        '\n' +
        'Once you let me know the second number, I can calculate it for you!'
    }
  ],
  container: null,
  stop_reason: 'end_turn',
  stop_sequence: null,
  stop_details: null,
  usage: {
    input_tokens: 594,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
    output_tokens: 102,
    service_tier: 'standard',
    inference_geo: 'not_available',
    speed: 'standard'
  },
  diagnostics: null
}
  
  ```
</details>

We can FORCE tool usage using tool_choice parameter on CreateMessageRequest: 

```
tool_choice?: { type: "auto" | "any" } | { type: "tool"; name: string } | { type: "none" };
```

Then, pass it into the request: 

```
const divideRequest: CreateMessageRequest = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    tools: [divideTwoNumbers],
    messages:
    [
        { 
            role: "user", content: "What 5 divided by ?"
        }
    ],
    tool_choice: { type: "tool", name: "divide_two_numbers"}
};
```

Oh no ! We hit our max_turn count !! Why? Because our tool_use loop copies the request, which now has tool_choice as a part of it, forcing it to be used every message turn - including where the model should be answering based on the tool result. Becuase of this, it can never produce end_turn and runs until the max turn count.

If we want to rectify this we have to specify that the tool should be used on the first turn ONLY.


</details>

<hr>

#### Anthropic SDK Journey

After going under the hood and understanding the amount of granular control the HTTP API offers using a simple fetch() wrapper - I have a deeper understanding of how the API works. However, for future learning I will be experimenting with the Anthropic SDK and following this course: 
- https://anthropic.skilljar.com/claude-with-the-anthropic-api/
