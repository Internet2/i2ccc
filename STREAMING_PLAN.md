# Streaming + Staged Loading Implementation Plan

## TODO

### Phase 1 — Staged Client-Side Loading Messages
- [ ] `frontend/src/data/loadingMessages.ts` — restructure into stage buckets (verbs + suffix per stage)
- [ ] `frontend/src/components/ChatArea.tsx` — add elapsed-time tracking + stage-aware message composition

### Phase 2 — Real Backend SSE + Bedrock Token Streaming

#### Backend
- [ ] `src/backend/chatbot_backend.py` — add `streaming_handler` entry point
- [ ] `src/backend/chatbot_backend.py` — add `invoke_model_stream` using `bedrock.converse_stream()`
- [ ] `src/backend/chatbot_backend.py` — emit SSE events at each pipeline stage boundary
- [ ] `src/proxy/proxy_handler.py` — add `streaming_handler` using `invoke_with_response_stream`

#### Infrastructure
- [ ] `cdk/backend.py` — add Function URL (`RESPONSE_STREAM`) to chat Lambda
- [ ] `cdk/backend.py` — add Function URL (`RESPONSE_STREAM`) to proxy Lambda
- [ ] `cdk/backend.py` — add IAM grant for proxy Lambda to invoke chat Lambda
- [ ] `cdk/backend.py` — add `CHAT_LAMBDA_ARN` env var to proxy Lambda
- [ ] `cdk/frontend.py` — add CloudFront behavior for streaming path (`/api/chat-stream`)

#### Frontend
- [ ] `frontend/src/types/index.ts` — add `StreamEvent` type, add `isStreaming` to `Message`
- [ ] `frontend/src/services/api.ts` — add `sendMessageStream` async generator
- [ ] `frontend/src/services/api.ts` — add `applyCitationMap` utility (port UUID→link logic from Python)
- [ ] `frontend/src/hooks/useChat.ts` — consume stream, update message content incrementally
- [ ] `frontend/src/hooks/useChat.ts` — expose `currentStage` and `docTitles` to consumers
- [ ] `frontend/src/components/ChatArea.tsx` — use real stage events (drop time-based fallback)
- [ ] `frontend/src/components/ChatArea.tsx` — show doc titles during filtering stage

---

## Overview

Two phases, each independently deployable:

- **Phase 1** — Staged client-side loading messages. No backend changes. Quick win (~1-2 hrs).
- **Phase 2** — Real backend SSE progress events + Bedrock token streaming. Full pipeline visibility + typewriter output. Requires infrastructure changes.

---

## Phase 1: Staged Loading Messages (Client-Side Only)

The funny words stay. We add a time-based stage system so the words cycle within a pool that matches the actual pipeline phase. The phrase becomes `[funny verb] [stage context]`.

```
0–4s:   "Rummaging through the knowledge base…"
4–9s:   "Distilling the results…"
9s+:    "Brewing a response…"
```

Timings are approximate but calibrated to the real pipeline: OpenSearch is fast (~1-3s), two Haiku calls take ~2-5s, Sonnet is the long tail (~10-25s).

### Files changed

#### `frontend/src/data/loadingMessages.ts`

Replace the flat array with three stage-specific verb pools and their suffix strings:

```ts
export type Stage = 'searching' | 'filtering' | 'generating';

export const STAGE_CONFIG: Record<Stage, { verbs: string[]; suffix: string }> = {
  searching: {
    suffix: 'through the knowledge base',
    verbs: [
      'Rummaging', 'Scouring', 'Spelunking', 'Trawling', 'Foraging',
      'Hunting', 'Combing', 'Rifling', 'Digging', 'Perusing',
      'Navigating', 'Wandering', 'Exploring', 'Sniffing',
    ],
  },
  filtering: {
    suffix: 'the results',
    verbs: [
      'Distilling', 'Curating', 'Winnowing', 'Untangling', 'Sifting',
      'Refining', 'Pruning', 'Deciphering', 'Parsing', 'Whittling',
      'Wrangling', 'Scheming', 'Calibrating', 'Deliberating',
    ],
  },
  generating: {
    suffix: 'a response',
    verbs: [
      'Brewing', 'Noodling', 'Concocting', 'Clauding', 'Baking',
      'Simmering', 'Marinating', 'Crafting', 'Weaving', 'Knitting',
      'Cooking', 'Forging', 'Conjuring', 'Hatching', 'Moseying',
      'Stewing', 'Percolating', 'Ruminating', 'Vibing', 'Incubating',
    ],
  },
};

// Timing thresholds in milliseconds (calibrated to real pipeline stages)
export const STAGE_THRESHOLDS = {
  filtering: 4000,   // Switch from searching → filtering after 4s
  generating: 9000,  // Switch from filtering → generating after 9s
};

export function getStage(elapsedMs: number): Stage {
  if (elapsedMs >= STAGE_THRESHOLDS.generating) return 'generating';
  if (elapsedMs >= STAGE_THRESHOLDS.filtering) return 'filtering';
  return 'searching';
}

export function pickVerb(stage: Stage, previous?: string): string {
  const { verbs } = STAGE_CONFIG[stage];
  let candidate = previous;
  while (!candidate || candidate === previous) {
    candidate = verbs[Math.floor(Math.random() * verbs.length)];
  }
  return candidate!;
}

export function composeMessage(stage: Stage, verb: string): string {
  return `${verb} ${STAGE_CONFIG[stage].suffix}`;
}
```

#### `frontend/src/components/ChatArea.tsx`

- Add a `loadingStartTimeRef` to record when `isLoading` first became true.
- Track `currentStage` and `currentVerb` in state.
- On each interval tick, compute elapsed time → derive stage → pick a new verb from that stage's pool → compose the full phrase.
- When stage transitions happen between ticks, reset the verb immediately.

Key logic change in the `useEffect` for loading:

```ts
const loadingStartTimeRef = useRef<number | null>(null);
const [currentStage, setCurrentStage] = useState<Stage>('searching');

// In the isLoading useEffect:
if (!isLoading) {
  loadingStartTimeRef.current = null;
  // ... clear timers, hide message
  return;
}

loadingStartTimeRef.current = Date.now();

const showNewMessage = (prevVerb?: string) => {
  const elapsed = Date.now() - (loadingStartTimeRef.current ?? Date.now());
  const stage = getStage(elapsed);
  const verb = pickVerb(stage, prevVerb);
  const message = composeMessage(stage, verb);

  setCurrentStage(stage);
  setLoadingMessage(message);
  loadingMessageRef.current = message;
  // ... fade-in logic unchanged
};
```

No other files change in Phase 1.

---

## Phase 2: Real Backend SSE + Bedrock Token Streaming

This delivers:
- Real stage events emitted as each pipeline step completes (not time-faked)
- Actual document titles shown as they are retrieved
- Tokens streaming from Bedrock token-by-token (typewriter effect)

### Architecture change

The current request path is:

```
Frontend → ProxyAPI (API GW) → Proxy Lambda → BackendAPI (API GW) → Chat Lambda
```

**API Gateway does not support response streaming.** The new path replaces the middle legs with Lambda Function URLs, which do support streaming:

```
Frontend → Proxy Lambda (Function URL, RESPONSE_STREAM)
              └── invokes → Chat Lambda (Function URL, RESPONSE_STREAM)
                                └── streams SSE events + Bedrock tokens
```

The feedback endpoint and existing API Gateway setup stay **completely unchanged**. Only the chat flow changes.

### SSE event protocol

All events are newline-delimited JSON sent over the streaming response. Each line is a JSON object:

```
{"type": "stage", "stage": "searching", "message": "Searching knowledge base"}
{"type": "stage", "stage": "filtering", "message": "Found 14 documents", "doc_titles": ["CICP 2024 Report", "AWS Best Practices", ...]}
{"type": "stage", "stage": "generating", "message": "Generating response"}
{"type": "token", "content": "Based on "}
{"type": "token", "content": "the CICP "}
{"type": "token", "content": "framework..."}
{"type": "done", "sources": [...], "timestamp": 1234567890}
{"type": "error", "message": "Something went wrong"}
```

The `stage` events are emitted between real pipeline steps. Token events are emitted as Bedrock streams them. `done` carries the final sources and timestamp for DynamoDB persistence on the frontend.

### Citation handling during streaming

The current system post-processes UUID placeholders in the final response. Streaming breaks this because we can't replace mid-stream text.

**Solution:** Send the UUID-to-source map as part of the `done` event, then do replacement client-side on the accumulated text after the stream closes.

```json
{
  "type": "done",
  "sources": [...],
  "timestamp": 1234567890,
  "source_map": {
    "abc123ef": {"title": "CICP 2024 Report", "url": "https://...", "member_content": false},
    "d4e5f678": {"title": "AWS Guide", "url": "https://...", "member_content": true}
  }
}
```

The client accumulates tokens into a string, then on `done`, runs the UUID replacement logic (same logic as the backend currently does) to produce the final rendered markdown.

---

### Backend changes

#### `src/backend/chatbot_backend.py`

Add a new streaming entry point `streaming_handler` alongside the existing `lambda_handler`. The existing handler stays intact for local development and fallback.

**Key structural changes:**

1. **Replace `invoke_model` for the main chat call** — switch from `bedrock.converse()` to `bedrock.converse_stream()`, yield token chunks to the caller.

2. **Emit SSE events at each stage boundary:**

```python
import json

def emit(stream_writer, event: dict):
    """Write a single SSE event as a newline-delimited JSON line."""
    stream_writer.write((json.dumps(event) + "\n").encode("utf-8"))

def streaming_handler(event, context):
    # This is the new entry point for Function URL invocations
    with response_stream_context(event, context) as stream:
        body = json.loads(event["body"])
        query = body["query"]
        session_id = body["session_id"]

        # Stage 1: searching
        emit(stream, {"type": "stage", "stage": "searching", "message": "Searching knowledge base"})
        embedding = generate_text_embedding(query)
        raw_docs = get_documents(embedding, query)
        selected_docs = select_top_documents(raw_docs)

        # Stage 2: filtering (emit real doc titles)
        doc_titles = [d["metadata"].get("title", "Untitled") for d in selected_docs]
        emit(stream, {
            "type": "stage",
            "stage": "filtering",
            "message": f"Found {len(selected_docs)} documents",
            "doc_titles": doc_titles[:6],  # cap for UI, show max 6
        })
        platform = classify_platform(query)
        filtered_docs = filter_documents(selected_docs, query, platform)

        # Stage 3: generating
        emit(stream, {"type": "stage", "stage": "generating", "message": "Generating response"})

        # Build source map (UUIDs) — same as current logic
        source_map, formatted_docs = build_source_map(filtered_docs)
        prompt = build_prompt(query, formatted_docs, conversation_history)

        # Stream Bedrock tokens
        accumulated = ""
        for token_chunk in invoke_model_stream(prompt, os.getenv("CHAT_MODEL_ID")):
            accumulated += token_chunk
            emit(stream, {"type": "token", "content": token_chunk})

        # Save to DynamoDB (post-process for storage)
        processed_response = post_process_citations(accumulated, source_map)
        timestamp = save_messages(session_id, query, processed_response, filtered_docs, conversation_turn)

        # Done — send source map for client-side citation rendering
        emit(stream, {
            "type": "done",
            "sources": extract_sources(source_map),
            "timestamp": timestamp,
            "source_map": source_map,
        })
```

3. **`invoke_model_stream` function** — wraps `bedrock.converse_stream()`:

```python
def invoke_model_stream(prompt: str, model_id: str):
    """Yields text chunks from Bedrock streaming response."""
    messages = [{"role": "user", "content": [{"text": prompt}]}]
    response = bedrock.converse_stream(
        modelId=model_id,
        messages=messages,
        inferenceConfig={"temperature": 0.0, "topP": 0.999, "maxTokens": 4096},
    )
    for event in response["stream"]:
        if "contentBlockDelta" in event:
            delta = event["contentBlockDelta"].get("delta", {})
            if "text" in delta:
                yield delta["text"]
```

4. **Lambda streaming context** — Python Lambda response streaming uses a special response format. The handler must be registered with the streaming response type:

```python
from awslambdaric.bootstrap import StreamingResponse  # available in Lambda runtime

# The Lambda is configured with invoke mode RESPONSE_STREAM in CDK.
# The handler writes to context.get_remaining_time_in_millis and uses
# the response_stream context (exact API depends on Lambda Python runtime version).
```

> **Note:** AWS Lambda response streaming in Python is done via the `lambda_handler` returning a generator, or by using the `@streaming_response` decorator from `aws_lambda_powertools`. Verify the exact API against the Python 3.13 Lambda runtime docs before implementing — the streaming response interface is relatively new.

#### `src/proxy/proxy_handler.py`

Add a new `streaming_handler` entry point that:

1. Retrieves the API key from SSM (existing logic, reuse cache).
2. Uses `boto3.client('lambda').invoke_with_response_stream()` to call the chat Lambda directly (bypassing API Gateway), piping the stream back to the frontend.

```python
def streaming_handler(event, context):
    lambda_client = boto3.client('lambda')
    api_key = get_api_key()

    body = json.loads(event.get('body', '{}'))
    payload = {**body, "x_api_key": api_key}  # pass key in payload, not header

    # Use ResponseStreamingFunction ARN from env var
    response = lambda_client.invoke_with_response_stream(
        FunctionName=os.environ['CHAT_LAMBDA_ARN'],
        InvocationType='RequestResponse',
        Payload=json.dumps(payload),
    )

    # Pipe the event stream back
    with response_stream_context(event, context) as stream:
        for chunk in response['EventStream']:
            if 'PayloadChunk' in chunk:
                stream.write(chunk['PayloadChunk']['Payload'])
```

> **Note:** `invoke_with_response_stream` requires the target Lambda to have `InvokeMode: RESPONSE_STREAM`. The proxy Lambda's IAM role needs `lambda:InvokeFunction` on the chat Lambda ARN.

---

### Infrastructure changes (CDK)

#### `cdk/backend.py`

**1. Chat Lambda — add Function URL with RESPONSE_STREAM:**

```python
from aws_cdk import aws_lambda as _lambda

chat_fn_url = chat_lambda.add_function_url(
    auth_type=_lambda.FunctionUrlAuthType.AWS_IAM,  # Only proxy Lambda can invoke
    invoke_mode=_lambda.InvokeMode.RESPONSE_STREAM,
    cors=_lambda.FunctionUrlCorsOptions(
        allowed_origins=["*"],
        allowed_methods=[_lambda.HttpMethod.POST],
        allowed_headers=["Content-Type"],
    ),
)

# Change handler to the new streaming handler
# In the Function definition: handler="chatbot_backend.streaming_handler"
# (or keep existing + add env var to route)
```

**2. Proxy Lambda — add Function URL with RESPONSE_STREAM:**

```python
proxy_fn_url = proxy_lambda.add_function_url(
    auth_type=_lambda.FunctionUrlAuthType.NONE,  # CloudFront + WAF handles access control
    invoke_mode=_lambda.InvokeMode.RESPONSE_STREAM,
    cors=_lambda.FunctionUrlCorsOptions(
        allowed_origins=[f"https://{frontend_distribution_domain}"],
        allowed_methods=[_lambda.HttpMethod.POST],
        allowed_headers=["Content-Type"],
    ),
)

# Expose URL as output
CfnOutput(self, "StreamingChatUrl", value=proxy_fn_url.url)
```

**3. Proxy Lambda — add env var + IAM permission to invoke chat Lambda:**

```python
proxy_lambda.add_environment("CHAT_LAMBDA_ARN", chat_lambda.function_arn)
proxy_lambda.add_environment("CHAT_LAMBDA_STREAMING_URL", chat_fn_url.url)

# Grant proxy Lambda permission to invoke chat Lambda with streaming
chat_lambda.grant_invoke_url(proxy_lambda)
proxy_lambda.add_to_role_policy(iam.PolicyStatement(
    actions=["lambda:InvokeFunction", "lambda:InvokeFunctionUrl"],
    resources=[chat_lambda.function_arn],
))
```

**4. Proxy Lambda — increase timeout:**

The proxy Lambda's current timeout is 70s. Streaming Bedrock responses for complex questions can take longer. Increase to match the chat Lambda's 60s response window plus overhead:

```python
# Proxy lambda timeout: currently 70s, keep or increase to 90s
timeout=Duration.seconds(90),
```

**5. CloudFront — add behavior for streaming URL:**

The existing CloudFront distribution routes to the ProxyAPI (API Gateway). We need to add a new origin/behavior for the streaming Function URL:

```python
# In cdk/frontend.py — add a behavior for the streaming endpoint
# Origin: proxy_fn_url.url (strip https://)
# Path pattern: /api/chat-stream  (new path, distinct from /api/chat-response)
# Cache: disabled (TTL=0, all headers forwarded)
# Viewer protocol: HTTPS only
```

---

### Frontend changes

#### `frontend/src/types/index.ts`

Add streaming-specific types:

```ts
export type StreamStage = 'searching' | 'filtering' | 'generating';

export interface StreamEvent {
  type: 'stage' | 'token' | 'done' | 'error';
  // stage event
  stage?: StreamStage;
  message?: string;
  doc_titles?: string[];
  // token event
  content?: string;
  // done event
  sources?: Source[];
  timestamp?: number;
  source_map?: Record<string, { title: string; url: string; member_content: boolean }>;
  // error event
  error?: string;
}

// Add to Message:
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sources?: Source[];
  isStreaming?: boolean;  // true while tokens are still arriving
}
```

#### `frontend/src/services/api.ts`

Add a new `sendMessageStream` function alongside the existing `sendMessage` (which stays for fallback/dev):

```ts
export async function* sendMessageStream(
  query: string,
  sessionId: string
): AsyncGenerator<StreamEvent> {
  const url = isDevelopment
    ? '/api/chat-stream'
    : `${import.meta.env.VITE_STREAMING_ENDPOINT}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, session_id: sessionId }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';  // keep incomplete last line

    for (const line of lines) {
      if (line.trim()) {
        try {
          yield JSON.parse(line) as StreamEvent;
        } catch {
          // ignore malformed lines
        }
      }
    }
  }
}
```

#### `frontend/src/hooks/useChat.ts`

Update `sendQuery` to consume the stream generator and update state incrementally:

```ts
const sendQuery = useCallback(async (query: string) => {
  // Add user message immediately (unchanged)
  const userMessage = { ... };
  updateSessionMessages((prev) => [...prev, userMessage]);
  setIsLoading(true);

  // Add an empty streaming assistant message
  const botMessageId = crypto.randomUUID();
  const streamingMessage: Message = {
    id: botMessageId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    isStreaming: true,
  };
  updateSessionMessages((prev) => [...prev, streamingMessage]);

  try {
    let accumulatedContent = '';

    for await (const event of sendMessageStream(query, sessionId)) {
      if (event.type === 'stage') {
        // Expose stage to ChatArea for real stage display
        setCurrentStage(event.stage ?? 'searching');
        setStageDocTitles(event.doc_titles ?? []);
      }

      if (event.type === 'token') {
        accumulatedContent += event.content ?? '';
        // Update the streaming message in-place
        updateStreamingMessage(botMessageId, accumulatedContent);
      }

      if (event.type === 'done') {
        // Apply citation post-processing client-side
        const finalContent = applyCitationMap(accumulatedContent, event.source_map ?? {});
        finalizeMessage(botMessageId, {
          content: finalContent,
          timestamp: event.timestamp ?? Date.now(),
          sources: event.sources ?? [],
          isStreaming: false,
        });
        setIsLoading(false);
      }

      if (event.type === 'error') {
        throw new Error(event.error);
      }
    }
  } catch (err) {
    // error handling unchanged
  } finally {
    setIsLoading(false);
  }
}, [...]);
```

> **`applyCitationMap`** — a new utility that replicates the backend's UUID-replacement logic in TypeScript. Input: raw LLM text with `[abc123ef]` placeholders + the source map. Output: markdown text with `[Title](url)` links.

#### `frontend/src/components/ChatArea.tsx`

When real stage events arrive from `useChat`, use them directly instead of the time-based fallback from Phase 1. The stage data flows:

`streaming SSE` → `useChat` (tracks `currentStage`, `doc_titles`) → `ChatArea` (renders)

In loading UI, show doc titles when available:

```tsx
{isLoading && (
  <div className="flex flex-col gap-1 px-1 py-2">
    <div className="flex items-center gap-3">
      {/* dots + funny staged verb (same as Phase 1) */}
      <span className="...">{loadingMessage}…</span>
    </div>
    {/* Doc titles, only shown during filtering stage */}
    {currentStage === 'filtering' && docTitles.length > 0 && (
      <div className="ml-6 flex flex-col gap-0.5">
        {docTitles.map((title) => (
          <span key={title} className="text-[11px] text-[var(--color-loading)] opacity-70">
            {title}
          </span>
        ))}
      </div>
    )}
  </div>
)}
```

---

## Implementation order

```
Phase 1  (no backend, safe to deploy anytime)
  1. loadingMessages.ts  — restructure into stage buckets
  2. ChatArea.tsx         — add elapsed-time stage tracking

Phase 2  (deploy together as one stack update)
  3. chatbot_backend.py  — add streaming_handler + invoke_model_stream
  4. proxy_handler.py    — add streaming_handler using invoke_with_response_stream
  5. cdk/backend.py      — add Function URLs, IAM grants, env vars
  6. cdk/frontend.py     — add CloudFront behavior for streaming path
  7. types/index.ts      — add StreamEvent, update Message
  8. services/api.ts     — add sendMessageStream generator
  9. hooks/useChat.ts    — consume stream, incremental state updates
  10. ChatArea.tsx        — use real stage events, show doc titles
```

## Risks and open questions

| Risk | Mitigation |
|------|-----------|
| Lambda Python streaming API — exact syntax for `RESPONSE_STREAM` mode in Python 3.13 | Verify against AWS docs before coding; `aws_lambda_powertools` has a `@streaming_response` decorator that simplifies this |
| Proxy Lambda can't use `invoke_with_response_stream` if it's still behind API Gateway | The Proxy Lambda needs its own Function URL — the existing ProxyAPI (API GW) is kept for feedback only |
| Citation post-processing in client-side TypeScript | Port the regex/replacement logic from `chatbot_backend.py` lines 221-281 to a TypeScript utility; test against known outputs |
| Streaming adds to Lambda billed duration | Minimal — Bedrock streaming doesn't increase model cost, only Lambda time-in-flight; 60s timeout is already set |
| CloudFront caching streaming responses | Set TTL=0 on the streaming behavior; caching streamed responses would break them |
| `converse_stream` response format differs from `converse` | The `contentBlockDelta` event structure needs careful handling for text vs. tool use events; filter only `text` deltas |
