# Datagran Memory OpenClaw Plugin

OpenClaw plugin that exposes Datagran unified memory through agent tools.

## What it provides

- `datagran_memory_connect` -> `POST /api/connections/memory`
- `datagran_memory_ingest` -> `POST /api/context/compile`
- `datagran_memory_query` -> `POST /api/context/brain`
- `/dg-memory-status` command for config sanity check

## Install (local dev)

```bash
openclaw plugins install -l ./plugins/datagran-memory
```

## Install (published npm package)

```bash
openclaw plugins install @datagran/datagran-memory
```

## Configure

```json
{
  "plugins": {
    "entries": {
      "datagran-memory": {
        "enabled": true,
        "config": {
          "baseUrl": "https://www.datagran.io",
          "apiKey": "sk_live_...",
          "defaults": {
            "mindState": "auto",
            "maxTokens": 512,
            "temperature": 0.2
          },
          "http": {
            "timeoutMs": 30000,
            "retries": 2
          }
        }
      }
    }
  }
}
```

Restart OpenClaw Gateway after config changes.

Note: if you paste `https://www.datagran.io/intelligence` as `baseUrl`, the plugin normalizes it to `https://www.datagran.io`.

## Tool examples

### 1) Connect user memory

```json
{
  "tool": "datagran_memory_connect",
  "params": {
    "endUserExternalId": "user-123",
    "email": "user@example.com"
  }
}
```

### 2) Ingest text

```json
{
  "tool": "datagran_memory_ingest",
  "params": {
    "endUserExternalId": "user-123",
    "name": "Support Notes",
    "text": "Long text content...",
    "type": "raw_text"
  }
}
```

### 3) Query memory

```json
{
  "tool": "datagran_memory_query",
  "params": {
    "endUserExternalId": "user-123",
    "question": "What are this user's pain points?",
    "mindState": "auto"
  }
}
```

## Test

```bash
npx tsx --test plugins/datagran-memory/src/index.test.ts
```
