# Datagran Memory — OpenClaw Plugin

Give your OpenClaw agent persistent, queryable memory powered by [Datagran Intelligence](https://www.datagran.io/intelligence).

## Getting Started (3 steps)

### Step 1: Get your Datagran API key

1. Go to [datagran.io/intelligence](https://www.datagran.io/intelligence) and sign up
2. Once logged in, go to your dashboard and copy your API key (starts with `sk_live_`)

### Step 2: Install the plugin

```bash
openclaw plugins install @datagran/datagran-memory
```

### Step 3: Configure

Add this to your OpenClaw config and replace `sk_live_YOUR_KEY` with your actual API key:

```json
{
  "plugins": {
    "entries": {
      "datagran-memory": {
        "enabled": true,
        "config": {
          "baseUrl": "https://www.datagran.io",
          "apiKey": "sk_live_YOUR_KEY"
        }
      }
    }
  }
}
```

Restart the OpenClaw Gateway. Done.

> Tip: `https://www.datagran.io/intelligence` also works as `baseUrl` — the plugin normalizes it automatically.

## Troubleshooting

### Config invalid: plugin manifest not found in `.../skills/datagran-memory/openclaw.plugin.json`

This means the user configured a **skills path** as a **plugin path**.  
The plugin must be installed from npm or loaded from the plugin root folder, not from `skills/...`.

Fix:

1. Remove any `plugins.load.paths` entry pointing to `.../skills/datagran-memory`
2. Reinstall cleanly:

```bash
openclaw plugins uninstall datagran-memory
openclaw plugins install @datagran/datagran-memory
```

3. Keep only `plugins.entries.datagran-memory.config` in config
4. Restart the gateway

### Datagran returns \"End user not found\"

Most common causes:

- API key mismatch (created data with one key/partner, querying with another)
- Identifier mismatch (different `endUserExternalId` than ingest step)
- Querying without the correct `connectionId`

Recommended workflow:

1. `datagran_memory_connect` with your `endUserExternalId`
2. `datagran_memory_ingest` using returned `connection_id`
3. `datagran_memory_query` using that same `connectionId`

## What it provides

Three agent tools:

| Tool | What it does | Datagran API |
|------|-------------|--------------|
| `datagran_memory_connect` | Create a memory connection for an end user | `POST /api/connections/memory` |
| `datagran_memory_ingest` | Store text into user memory | `POST /api/context/compile` |
| `datagran_memory_query` | Ask questions against user memory | `POST /api/context/brain` |

Plus a `/dg-memory-status` command to verify your config is working.

## Usage examples

### Connect a user

```json
{
  "tool": "datagran_memory_connect",
  "params": {
    "endUserExternalId": "user-123",
    "email": "user@example.com"
  }
}
```

### Store text into memory

```json
{
  "tool": "datagran_memory_ingest",
  "params": {
    "endUserExternalId": "user-123",
    "name": "Support Notes",
    "text": "Long text content here...",
    "type": "raw_text"
  }
}
```

### Query memory

```json
{
  "tool": "datagran_memory_query",
  "params": {
    "endUserExternalId": "user-123",
    "question": "What are this user's pain points?"
  }
}
```

## Advanced config (optional)

```json
{
  "plugins": {
    "entries": {
      "datagran-memory": {
        "enabled": true,
        "config": {
          "baseUrl": "https://www.datagran.io",
          "apiKey": "sk_live_YOUR_KEY",
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

## Links

- [Datagran Intelligence](https://www.datagran.io/intelligence) — sign up and get your API key
- [GitHub](https://github.com/datagran-auth/datagran-openclaw-memory-plugin) — source code
- [npm](https://www.npmjs.com/package/@datagran/datagran-memory) — package registry

## Development

```bash
git clone https://github.com/datagran-auth/datagran-openclaw-memory-plugin.git
cd datagran-openclaw-memory-plugin
npm install
npm test
```
