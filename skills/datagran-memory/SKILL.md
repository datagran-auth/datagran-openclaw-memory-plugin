# Datagran Memory Skill

You have access to Datagran persistent memory for end users. This lets you store and retrieve information across conversations.

## Core Principles

1. **Current conversation comes first.** If the user has said something in this conversation that answers the question, use that. Do NOT call memory tools to look up something the user literally just told you. The current conversation context always takes priority over stored memory.

2. **Check memory before fetching new data.** If the answer isn't in the current conversation, query Datagran memory next — the answer may already be there from a previous session. Only fetch new external data as a last resort.

## Tools Available

- `datagran_memory_query` — Ask a question against a user's memory
- `datagran_memory_ingest` — Store text into a user's memory
- `datagran_memory_connect` — Create a memory connection (usually auto-handled)

## Workflow

### When the user asks a question:

1. **Check the current conversation first**: If the user already said or provided the answer in this session, use it directly. No tool call needed.
2. **Then query memory**: Call `datagran_memory_query` with the question and the user's `endUserExternalId`
3. **If answer found**: Use it. Done. No need to fetch new data.
4. **If "no brain found"**: The user has no stored data yet. Tell them, then help them store data.
5. **If answer is incomplete**: Fetch new data, ingest it with `datagran_memory_ingest`, then query again.

### When you receive new data (from any source):

1. **Only store it if it's relevant new information** the user might need in future conversations. Ask yourself: "Would this be useful if the user comes back tomorrow?" If yes, ingest it. If it's transient, redundant, or already in memory, skip it.
2. Use a descriptive `name` (e.g., "Facebook Ads Report Dec 2025", "Support ticket #4521")
3. Set `type` to match the source when possible (e.g., "facebook_ads", "raw_text", "firecrawl")

### When starting a new conversation with a known user:

1. **Greet with context**: Query their memory to recall what you discussed before
2. This makes the experience feel continuous across sessions

## Parameters Guide

### endUserExternalId
Your unique identifier for the user. Use the same ID consistently across all calls for the same user. This is how Datagran knows whose memory to access.

### mindState (for queries)
- `auto` (default) — Let Datagran pick the best strategy. Use this most of the time.
- `short_term` — Only recent data, fastest response, no AI synthesis
- `long_term` — Search both recent and archived data with AI-generated answer

### providers (for queries)
Optional filter. If you know the data source, filter by it:
- `["facebook_ads"]` — Only Facebook Ads data
- `["google_ads", "facebook_ads"]` — Only ads data
- Omit to search everything

## Memory Architecture (what happens behind the scenes)

- **Short-term**: Recent data (~last 10k tokens) + rolling summary. Always searched.
- **Long-term (RAG)**: Older data archived as vector embeddings. Searched when mindState is "auto" or "long_term".
- **Rollup**: When short-term exceeds the threshold, overflow is automatically archived into long-term. You don't manage this — it's automatic.

## Examples

### Check if user has marketing data
```
datagran_memory_query({
  endUserExternalId: "user-123",
  question: "What marketing platforms has this user connected?"
})
```

### Store a report
```
datagran_memory_ingest({
  endUserExternalId: "user-123",
  name: "Weekly Ad Performance Jan 20-26",
  text: "Facebook: $2,400 spent, 340 leads...",
  type: "facebook_ads"
})
```

### Recall previous conversation context
```
datagran_memory_query({
  endUserExternalId: "user-123",
  question: "What did we discuss in our last conversation?"
})
```

## Important Rules

1. **Current conversation always wins.** If the user just told you something, use it. Don't call a memory tool to re-confirm what's already in the chat.
2. **Never skip the query step.** When the answer isn't in the current conversation, always check memory before fetching external data. Redundant fetches waste time and money.
3. **Be selective about what you store.** Only ingest data that is new, relevant, and likely useful in future conversations. Don't store duplicates, temporary results, or data that's already in memory.
4. **Use consistent endUserExternalId.** Same user = same ID = same memory.
5. **Don't ingest trivial data.** Greetings, confirmations, and small talk don't need to be stored.
6. **Trust the freshness signals.** The response includes timestamps — prefer newer data when conflicts exist. But if the user corrects something in the current conversation, the correction overrides any stored memory.
