# AnotherLife

**A life simulator where the AI of your choice tells the story.**

AnotherLife is a browser game that plays like BitLife. You're born, you press **+ Age**,
and you live a whole life one year at a time. Along the way you go to school, get jobs and get
promoted, date, marry, have kids and adopt pets, buy houses and cars, gamble, commit crimes,
go to prison and try to escape, get famous, and finally die and earn a ribbon. Then you can
carry on as one of your children.

The difference: the story is written by **a large language model you bring**: one running on
your own computer (LM Studio, Ollama, llama.cpp, …) or a cloud AI with your own API key (Claude,
OpenAI, Gemini, OpenRouter, …). The model writes:

- each year's life-log lines and random events with choices,
- what happens after you pick a choice, including stat, money and relationship changes and arrests,
- **Do Anything**: type any action ("start a garage band with my best friend") and the AI decides
  what happens,
- conversations: the result of a *Conversation* or *Spend Time* interaction, plus a free-form
  **💬 Talk** chat with anyone in your life,
- job interview questions,
- your obituary.

The game engine keeps the rules (stats, money, ages, jail time, death). It checks and caps
everything the model proposes, so a confused model can't hand you a billion dollars. If your AI
isn't reachable, or you skip a slow answer, the game uses its built-in offline event library.

> AnotherLife is a fan-made game inspired by BitLife's gameplay. It is not affiliated with or
> endorsed by Candywriter, and it uses no BitLife names, art or assets.

## Play it

AnotherLife is a static website hosted on Cloudflare. You bring the AI: either a model running
on **your own computer** (LM Studio, Ollama, llama.cpp, KoboldCpp, Jan or any OpenAI-compatible
server), or a **cloud AI with your own API key** (Claude, OpenAI, Google Gemini, OpenRouter, Groq,
Mistral, DeepSeek, xAI Grok, Together AI or any OpenAI-compatible API). The page in your browser
talks straight to the AI you pick; there is no AnotherLife server in between. An API key is
stored only in your browser (localStorage) and is sent only to the provider it belongs to.

1. **Open the game** at its Cloudflare URL (see [Deploying](#deploying-to-cloudflare)), e.g.
   `https://snag.<your-account>.workers.dev`.
2. **Choose your AI.** Before you can start a life, the first-run **Choose your AI** screen asks
   how the story should be written:
   - **🖥️ AI on my computer** → pick your server (Option A below),
   - **🔑 AI service with my own API key** → pick a provider (Option B below),
   - **🎲 Play without AI** → the built-in stories only (you can add an AI later).

   Then check the **Server URL / API URL** (pre-filled), paste your **API key** if the provider
   needs one (🔒 it stays in this browser and is sent only to that provider; *Get a key* links to
   the provider's key page), follow the setup steps shown, and press **Test connection**. Pick a
   **Model** from the list it returns, or leave it on *Auto*, and press **Start playing**. If the
   test fails you can still **Save anyway** and fix it later, or go back and choose a different AI.
3. Press **New Life**. The AI dot in the header turns green once your AI is connected. To switch
   later, use **Change AI** on the main menu or ⚙️ Settings → **Change AI provider / run setup
   again**.

**Option A: an AI on your own computer** (free, private, needs a decent GPU or Apple Silicon)

| Server | Setup |
|---|---|
| [LM Studio](https://lmstudio.ai) | Download a 7–14B chat model (Qwen 3, Llama 3.x, Gemma 3, Mistral at Q4/Q5). In the **Developer** tab load it, open **Server Settings**, turn on **Enable CORS**, and start the server (or run `lms server start --cors`). URL: `http://localhost:1234/v1`. |
| [Ollama](https://ollama.com) | `ollama pull llama3.2`, then let the website call it: start Ollama with `OLLAMA_ORIGINS="*" ollama serve`. With the Windows/macOS app, set the `OLLAMA_ORIGINS` environment variable to `*` and restart Ollama. URL: `http://localhost:11434/v1`. |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | `llama-server -m model.gguf --port 8080` (accepts browser requests by default). URL: `http://localhost:8080/v1`. |
| [KoboldCpp](https://github.com/LostRuins/koboldcpp) | Start it with a model loaded. URL: `http://localhost:5001/v1`. |
| [Jan](https://jan.ai) | Settings → **Local API Server**: turn on CORS and start the server. URL: `http://localhost:1337/v1`. |
| Anything else | vLLM, LocalAI, text-generation-webui…: start its OpenAI-compatible API, allow cross-origin (CORS) requests, and paste its `/v1` URL. |

When Chrome or Edge asks to let the site **access devices on your local network**, click
**Allow**. That permission is how the hosted page reaches a server on your computer.

**Option B: a cloud AI with your own API key** (works on any device, the provider bills you)

Pick the provider, paste your key and leave **Model** on *Auto* (or choose one from the list):
[Claude](https://console.anthropic.com/settings/keys) (default model Claude Opus 5.5),
[OpenAI](https://platform.openai.com/api-keys), [Google Gemini](https://aistudio.google.com/apikey)
(free tier), [OpenRouter](https://openrouter.ai/keys) (hundreds of models, some free),
[Groq](https://console.groq.com/keys) (free tier), [Mistral](https://console.mistral.ai/api-keys),
[DeepSeek](https://platform.deepseek.com/api_keys), [xAI](https://console.x.ai),
[Together AI](https://api.together.ai/settings/api-keys), or any OpenAI-compatible URL + key.
If a provider refuses requests made directly from a browser (CORS), use OpenRouter instead or
[run the game locally](#run-it-locally-instead).

No AI at all? Choose **Play without AI** (or set *AI narration* to **Off** in Settings) and the
game plays with its built-in offline event library.

**Playing on another device (phone, tablet):** a cloud provider is the easiest. For a local
server, the AI address in ⚙️ Settings must point at the computer running it, and a secure
(https) page can't call a plain `http://192.168…` address on every browser. The reliable way is
an https tunnel, for example `cloudflared tunnel --url http://localhost:1234`; paste the
`https://….trycloudflare.com/v1` address it prints into Settings.

## Deploying to Cloudflare

This repo is connected to a Cloudflare Worker named **`snag`** through Workers Builds. Every push
to the Worker's production branch rebuilds and redeploys the site. `wrangler.jsonc` declares a
static-assets Worker: `wrangler deploy` runs `npm run build` (typecheck + Vite) and uploads
`dist/`, so a build that doesn't compile is never deployed. The site is served at
`https://snag.<your-account>.workers.dev` plus any custom domain attached to the Worker under
**Settings → Domains & Routes**.

To deploy by hand from your computer:

```bash
npm install
npx wrangler login
npm run deploy
```

## Run it locally instead

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server forwards `/lmstudio/*` to LM Studio, so CORS doesn't
need to be on. If LM Studio is on another machine or port, use
`LMSTUDIO_URL=http://192.168.1.50:1234 npm run dev`.

## Settings (⚙️)

| Setting | What it does |
|---|---|
| **AI narration** | *Off*: fully offline. *Balanced* (default): the AI writes events, outcomes, conversations, interviews, "Do Anything" and obituaries. *Full*: the AI also rewrites every activity result (slower). |
| **AI provider** | Where the story comes from: a local server (LM Studio, Ollama, llama.cpp, KoboldCpp, Jan, other) or a cloud API (Claude, OpenAI, Gemini, OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, other). Tap **Change** to pick another; each provider remembers its own URL, key and model, so you can switch back and forth. **Change AI provider / run setup again** reopens the first-run screen. |
| **Server URL** | The provider's API address, pre-filled for each provider. LM Studio on the hosted site uses `http://localhost:1234/v1` (needs **Enable CORS**); `npm run dev` uses `/lmstudio/v1` through its proxy. A tunnel URL works too. |
| **API key** | Required for cloud providers; optional token for local servers that have authentication on. Stored only in this browser and sent only to that provider. |
| **Model** | *Auto* uses the model loaded in your local server, or a good default for a cloud provider (Claude Opus 5.5 for Claude). **Test connection** fills the list with the provider's models; *Type a model id* lets you enter one by hand. |
| **Structured output** | Asks for JSON that matches a schema. The game steps down automatically (JSON schema → JSON mode → plain prompt) if a model rejects it; turn it off to always use the plain prompt. |
| **Skip thinking** | Asks reasoning models (Qwen 3, DeepSeek-R1, gpt-oss, OpenAI o-series/GPT-5, Gemini 2.5 Flash, …) to answer without a long think step. |
| **Content rating** | Family / Teen / Mature. The default is Teen: dark humor, nothing explicit. |
| **Temperature, max tokens, timeout** | Tuning for your model and hardware. Temperature is not sent to models that don't accept it (e.g. Claude, OpenAI reasoning models). Claude always gets at least 4,000 max tokens. |

## Troubleshooting

- **Red status dot / "Can't reach <your server>"** (local AI): check that the server is running
  on the port in the URL, that a model is loaded, and (on the hosted site) that it allows
  cross-origin requests (LM Studio: **Enable CORS**; Ollama: `OLLAMA_ORIGINS="*"`) and that you
  allowed local network access in the browser. In Chrome, open the 🔒 icon in the address bar
  → *Site settings* → *Local network access* → *Allow*. Then press **Test connection** in
  Settings. The setup steps for each server are shown under *How to set up …*.
- **Cloud AI errors**: "needs an API key" / "rejected the key" means the key is missing or wrong
  (paste it again in Settings); a quota or billing message comes from the provider's account.
- **Safari**: Safari may block a secure website from calling `http://localhost`. Use Chrome, Edge
  or Firefox, or run the game locally with `npm run dev`.
- **Very slow years**: use a smaller or more quantized model, enable *Skip thinking*, or lower *max
  tokens*. You can always press **Skip** on the thinking card to use the offline outcome for that
  step.
- **"response_format" errors**: turn off *Structured output*. The game still extracts and repairs
  JSON from plain answers.

## Development

```bash
npm run dev          # dev server with the LM Studio proxy
npm test             # unit tests (Vitest)
npm run typecheck    # TypeScript
npm run build        # production build into dist/ (serve with `npm run preview`, which keeps the proxy)
npm run deploy       # build and deploy to Cloudflare (needs `npx wrangler login` once)
node scripts/mock-lmstudio.mjs   # a fake OpenAI-compatible AI on :1234 that returns schema-shaped JSON (no model needed);
                                 # pick LM Studio, "Other local server" or OpenAI (any key) and point the URL at it
```

The engine (`src/game`) is plain TypeScript with a seeded RNG and no React. The AI layer is in
`src/ai`, and the React UI is in `src/ui`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for
how the pieces fit together.
