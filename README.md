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
- https://platform.claude.com/docs/en/managed-agents/event-deltas
  - Of different types containing different information.
  - Examples of type "event_delta" with "content_delta" with "content" of type "text"


<hr>

### Usage Journey

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

#### Claude MEssages API w/ Tool Usage

For the exploration in this, the descriptions from the guide I was following started to fall off and leant more towards pushing their API that they wanted to sell. The next few implementations have been build with the help of Claude chat, using my GitHub repository as a resource in the Project context for the chats.

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
