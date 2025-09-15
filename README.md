# Solana DBC Mint Detector (Tatum MCP)

A zero‑build, This bot detects newly created tokens associated with the **DBC virtual pool program** on **Solana mainnet**, using the **Tatum MCP** server over the Model Context Protocol (MCP). The script polls recent program transactions, parses logs and post‑balances to identify candidate mints, finds the virtual pool ("bonding curve") account, gathers SOL balances, checks the minter, and returns a compact JSON payload.

> **No build required.** You can clone and run directly with `npm start` (via `tsx`).

---

## ✨ Features

* 🔌 **MCP over stdio**: Launches `@tatumio/blockchain-mcp` via `npx` and talks to it with `@modelcontextprotocol/sdk`.
* 🔎 **Program watcher**: Polls `getSignaturesForAddress` for the DBC program (configurable).
* 🪙 **Mint discovery**: Uses `postTokenBalances` to extract the mint address (excluding well‑known system/program mints).
* 📈 **Bonding curve detection**: Identifies the pool account by layout size (default heuristic: `space === 424`) and fetches its SOL balance.
* 👤 **Minter hygiene**: Reads the minter's SOL balance; optionally checks against a malicious-address service.
* 🧯 **Rate‑limiting**: One MCP call per second to stay friendly with gateways.
* 🧱 **Strict ESM + TypeScript**: Runs with `tsx`—no compilation step.

---

## 🧰 Requirements

* **Node.js 20+** (uses `timers/promises` and ESM imports)
* **npm** (or `pnpm`/`yarn` if you prefer)
* **Tatum API Key** (free/paid; set as `TATUM_API_KEY` we are querying many account so 1 added rate limiter per 1sec. )

---

## ⚡️ Install the Tatum MCP server (required)

The watcher talks to a local MCP server provided by Tatum. Install it **globally** so the script can spawn it reliably (this also matches Windows expectations and is the starting point for the bot process):

```bash
npm install -g @tatumio/blockchain-mcp
```

**Why global install?**

* Ensures `npx @tatumio/blockchain-mcp` resolves instantly.
* Avoids PATH issues, especially on **Windows**.
* Matches the bot’s design where the MCP server is the process origin.

> Verify it’s on your PATH:
>
> ```bash
> npx @tatumio/blockchain-mcp --help
> ```
>
> If you see usage output, you’re good.

---

## 🚀 Quick Start (Clone → Install → Run)

```bash
# 0) Install the Tatum MCP server (one time)
npm install -g @tatumio/blockchain-mcp

# 1) Clone
git clone https://github.com/developermine/tatum-mcp-solana-bot.git
cd tatum-mcp-solana-bot

# 2) Install deps (no build step!)
npm install

# 3) Configure env
cp example.env to .env
# edit .env and set TATUM_API_KEY=...

# 4) Run
npm start
```

If everything is wired correctly, you’ll see logs like:

```text
🚀 Connected to Tatum MCP Server
New token detected: {
  mintAddress: '...',
  bondingCurveAddress: '...',
  solBalance: 1.23456789,
  minterAddress: '...',
  minterSolBalance: 0.42,
  processSignature: '3Gf...xyz',
  isMalicious: false
}
```

---

## 📂 Project Structure

```
.
src/
├── config/
│   └── config.ts              # Configuration (chain, program ID, excluded addresses)
├── lib/
│   ├── blockchain/
│   │   ├── client.ts         # Tatum MCP client setup and RPC utilities
│   │   └── types.ts          # TypeScript interfaces (RpcResponse, TokenData)
│   ├── services/
│   │   └── tokenDetector.ts  # Core logic for polling and processing tokens
│   └── utils/
│       ├── rateLimiter.ts    # Rate-limiting for Tatum API compliance
│       └── logger.ts         # Structured logging and token data storage
├── bot.ts                    # Entry point for running the bot
├── .env                      # Environment variables
├── .gitignore                # Ignores node_modules, .env, dist, tokens.json, state.json
├── package.json              # Dependencies and scripts
└── tsconfig.json             # TypeScript configuration
```

---

## ⚙️ Configuration

All config is environment‑driven (see **.env.example**):

| Variable        | Required | Default                                       | Description                                             |
| --------------- | -------- | --------------------------------------------- | ------------------------------------------------------- |
| `TATUM_API_KEY` | ✅        | —                                             | Your Tatum API key (used by `@tatumio/blockchain-mcp`). |
| `CHAIN`         | ❌        | `solana-mainnet`                              | Chain identifier passed to the MCP RPC gateway.         |
| `PROGRAM_ID`    | ❌        | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` | DBC/virtual pool program to watch.                      |
| `RATE_LIMIT_MS` | ❌        | `1000`                                        | Minimum delay between MCP calls (ms).                   |


### Excluded Addresses

The watcher ships with a curated **denylist** of common system/program accounts and mints (e.g., `So111...`, token program, metadata program) to avoid false positives. Add or remove addresses in `excludedAddresses` as needed.

### Bonding Curve Heuristic

We identify the bonding‑curve/virtual‑pool account using a **layout size check** (`space === 424`). If your target program uses a different state size or multiple variants, update that check accordingly.

---

## 🧠 How It Works (Under the Hood)

1. **Connect MCP**: Start `@tatumio/blockchain-mcp` with `npx` over stdio transport.
2. **Fetch signers**: Call `getSignaturesForAddress(PROGRAM_ID, { limit: 10 })` and record the newest signature.
3. **Inspect transaction**: `getTransaction(signature, { maxSupportedTransactionVersion: 0 })` → read `meta.logMessages` and `postTokenBalances`.
4. **Detect mint**: Pick the first **non‑excluded** mint from `postTokenBalances`.
5. **Locate pool account**: Search all non‑excluded `accountKeys` for an account whose `getAccountInfo(...).value.space` matches the expected layout size.
6. **Collect balances**: `getBalance` for the pool and for the minter key.
7. **(Optional) Risk check**: Call a `check_malicious_address` tool if available (stubbed behind `rateLimitedCallTool`).
8. **Emit result**: Print a compact JSON object with the detected entities.

---

## 🧪 Example Output

```json
{
  "mintAddress": "9d...abc",
  "bondingCurveAddress": "BQ...pqr",
  "solBalance": 0.983251112,
  "minterAddress": "2F...xyz",
  "minterSolBalance": 4.0021,
  "processSignature": "5fK...C2c",
  "isMalicious": false
}
```

---

## 🛡️ Security & Cost Notes

* **Never commit `.env`**. The template `.env.example` is safe to commit; your `.env` is not.
* MCP calls relay through Tatum—**RPC usage may incur costs** per their plan. Keep the 1s rate limit (or higher) in production.
* Treat `isMalicious` as **advisory** unless your malicious‑address tool has strong guarantees.

---

## 🧩 Extending

* **Webhooks / MQ**: Replace the `console.log` with a publisher to Discord, Slack, Kafka, or a webhook.
* **Filters**: Add heuristics (e.g., minimum pool SOL, metadata sanity checks) before emitting results.
* **Storage**: Persist seen signatures to avoid reprocessing on restart.

---

## 🧰 Scripts

* `npm start` → run the watcher (via `tsx`, no build)
* `npm run dev` → run with a file watcher
* `npm run lint` → (optional) add ESLint and wire it up here

---

## 🐞 Troubleshooting

* **Parse error: Outer JSON error** → The MCP tool returned an error payload; verify `TATUM_API_KEY` and network access.
* **Invalid response structure** → Check your MCP is running and that your `client.callTool` names match (`gateway_execute_rpc`).
* **Transaction version not supported** → We pass `{ maxSupportedTransactionVersion: 0 }`; make sure you didn’t remove it.
* **Empty results** → The latest transactions may not be mints; let it keep polling or widen detection heuristics.

---

## 🤝 Contributing

PRs welcome! Please:

1. Fork the repo
2. Create a feature branch
3. Commit with clear messages
4. Open a PR with context and screenshots/logs where helpful

---

## 📎 Appendix

### `.env.example`

```dotenv
# required
TATUM_API_KEY=

# optional (defaults shown)
CHAIN=solana-mainnet
PROGRAM_ID=dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
```

### `package.json` (zero‑build)

```json
{
  "name": "solana-dbc-mint-detector",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/bot.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.4.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.5.4"
  }
}
```

### `.gitignore`

```
# node
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# env
.env
.DS_Store
```

---

### Notes on MCP tools

This project assumes the Tatum MCP exposes a tool named `gateway_execute_rpc` that forwards Solana JSON‑RPC (e.g., `getTransaction`). If your MCP variant uses different tool names, update the `rateLimitedCallTool` invocations accordingly. The optional `check_malicious_address` tool can be disabled or replaced depending on availability.

---

## 🧰 MCP tool calls used (for hackathon reviewers)

Below are the exact **MCP tool invocations** this bot relies on, including the key JSON‑RPC methods and arguments:

1. **`gateway_execute_rpc` → `getSignaturesForAddress`**

   ```json
   {
     "name": "gateway_execute_rpc",
     "arguments": {
       "chain": "solana-mainnet",
       "method": "getSignaturesForAddress",
       "params": [
         "<PROGRAM_ID>",
         { "limit": 10, "before": null, "commitment": "confirmed" }
       ]
     }
   }
   ```

   *Purpose*: Pull recent program transactions to find the newest candidate signature.

2. **`gateway_execute_rpc` → `getTransaction`**

   ```json
   {
     "name": "gateway_execute_rpc",
     "arguments": {
       "chain": "solana-mainnet",
       "method": "getTransaction",
       "params": [
         "<SIGNATURE>",
         { "commitment": "confirmed", "maxSupportedTransactionVersion": 0 }
       ]
     }
   }
   ```

   *Purpose*: Inspect `meta.logMessages` and `postTokenBalances` to confirm token creation and extract the mint.

3. **`gateway_execute_rpc` → `getAccountInfo` (jsonParsed)**

   ```json
   {
     "name": "gateway_execute_rpc",
     "arguments": {
       "chain": "solana-mainnet",
       "method": "getAccountInfo",
       "params": [
         "<ACCOUNT_ADDRESS>",
         { "encoding": "jsonParsed", "commitment": "confirmed" }
       ]
     }
   }
   ```

   *Purpose*: Identify the bonding‑curve/virtual‑pool account by its `value.space` (heuristic: `424`).

4. **`gateway_execute_rpc` → `getBalance`**

   ```json
   {
     "name": "gateway_execute_rpc",
     "arguments": {
       "chain": "solana-mainnet",
       "method": "getBalance",
       "params": [
         "<ACCOUNT_ADDRESS>",
         { "commitment": "confirmed" }
       ]
     }
   }
   ```

   *Purpose*: Fetch SOL balance for the bonding curve account and the minter.

5. **`check_malicious_address` (optional)**

   ```json
   {
     "name": "check_malicious_address",
     "arguments": { "address": "<MINTER_ADDRESS>" }
   }
   ```

   *Purpose*: Advisory risk surface check; returns `{ isMalicious: boolean }`.

> All tool calls are wrapped by a **rate limiter** (`await setTimeout(1000)`) in `rateLimitedCallTool(...)` to keep a 1 req/s pace.

---

## 🪟 Windows: Required guard to prevent silent exits (ESM entrypoint)

**Windows users:** you must add the entrypoint guard to **your script**. If you still see silent exits, patch the **global MCP** entry as well (steps below).

On some Windows setups, ESM `import.meta.url` comparisons can cause **silent exits** when the script is not recognized as the true entrypoint. Add a small guard so `main()` only runs when this file is the actual process entry.

### 0) Make sure the Tatum MCP server is globally installed

```bash
npm install -g @tatumio/blockchain-mcp
```

This ensures `npx @tatumio/blockchain-mcp` resolves instantly from your script.

### 1) Add these imports at the **very top** of `src/index.ts`

```ts
// Top of file
import path from "path";
import { pathToFileURL } from "url";
import dotenv from "dotenv";
import { setTimeout } from "timers/promises";

import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

dotenv.config();
```

> Putting `path`/`url` first is not strictly required, but helps readability. The key is that all imports remain at the top in ESM.

### 2) Define the entrypoint detector **before** your `main()`

```ts
// Entrypoint detector (avoid silent shutdown on Windows)
function isMain(importMeta: ImportMeta): boolean {
  const entry = process.argv[1];
  if (!entry) return false; // e.g., node -e
  const entryHref = pathToFileURL(path.resolve(entry)).href;
  return importMeta.url === entryHref;
}
```

### 3) Keep the rest of your bot code as-is

```ts
// ... transport, client, config, helpers, pollNewTokens, main() ...
```

### 4) Replace the direct `main()` call with the guarded call

```ts
// Remove or comment the direct call:
// main().catch(console.error);

// Use the guard instead:
if (isMain(import.meta)) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
```

### 5) Patch the **global MCP** package to add the same guard (Windows)

On some Windows machines, you’ll also need to add the guard to the **globally installed** MCP entrypoint to avoid silent exits when spawned via `npx`.

1. Find your global `node_modules` path:

   ```bash
   npm root -g
   ```
2. Open: `<global-node-modules>/@tatumio/blockchain-mcp/`
3. Locate the runtime entry (e.g., `dist/index.js` or the file targeted by the package `bin`).
4. Wrap its `main()` call with the same `isMain(import.meta)` guard (or add if missing).
5. Test it:

   ```bash
   npx @tatumio/blockchain-mcp --help
   ```

> **Note**: Updating the global package may be overwritten by future upgrades. Re‑apply if you update `@tatumio/blockchain-mcp`.

**Quick Windows Checklist**

* [x] Global MCP installed: `npm install -g @tatumio/blockchain-mcp`
* [x] Guard added in **your** `src/index.ts`
* [x] (If needed) Guard added in global MCP entry file
* [x] `package.json` has `{ "type": "module" }`
* [x] Run via `npx @tatumio/blockchain-mcp` (uses `tsx` — no build needed)

---

## ✅ Reminder: Our script already launches MCP

The watcher uses:

```ts
const transport = new StdioClientTransport({
  command: "npx",
  args: ["@tatumio/blockchain-mcp"],
  env: { TATUM_API_KEY: process.env.TATUM_API_KEY || "" },
});
```

With the MCP installed globally, `npx` resolves immediately; otherwise, `npx` can fetch and execute it on demand.
