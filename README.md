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
