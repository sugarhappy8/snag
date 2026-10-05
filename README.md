# AnotherLife

**A life simulator where your own local AI tells the story.**

AnotherLife is a browser game that plays like BitLife. You're born, you press **+ Age**,
and you live a whole life one year at a time. Along the way you go to school, get jobs and get
promoted, date, marry, have kids and adopt pets, buy houses and cars, gamble, commit crimes,
go to prison and try to escape, get famous, and finally die and earn a ribbon. Then you can
carry on as one of your children.

The difference: the story is written by **a large language model running on your own computer
in [LM Studio](https://lmstudio.ai)**. The model writes:

- each year's life-log lines and random events with choices,
- what happens after you pick a choice, including stat, money and relationship changes and arrests,
- **Do Anything**: type any action ("start a garage band with my best friend") and the AI decides
  what happens,
- conversations: the result of a *Conversation* or *Spend Time* interaction, plus a free-form
  **💬 Talk** chat with anyone in your life,
- job interview questions,
- your obituary.

The game engine keeps the rules (stats, money, ages, jail time, death). It checks and caps
everything the model proposes, so a confused model can't hand you a billion dollars. If LM Studio
isn't running, or you skip a slow answer, the game uses its built-in offline event library.

> AnotherLife is a fan-made game inspired by BitLife's gameplay. It is not affiliated with or
> endorsed by Candywriter, and it uses no BitLife names, art or assets.

## Play it

AnotherLife is a static website hosted on Cloudflare. The AI runs on **your** computer: the page
in your browser talks straight to LM Studio on `localhost`, so your games and prompts never touch
a server.

1. **Set up LM Studio** (one time)
   1. Install [LM Studio](https://lmstudio.ai) and download a chat/instruct model. A 7–14B instruct
      model such as Qwen 3, Llama 3.x, Gemma 3 or Mistral at Q4/Q5 works well. Smaller models work
      but write blander stories.
   2. Open the **Developer** tab, load the model, open **Server Settings** and turn on
      **Enable CORS**. This lets the website talk to LM Studio.
   3. Switch the server on. It listens on `http://localhost:1234` by default. From a terminal you
      can instead run `lms server start --cors`.
2. **Open the game** at its Cloudflare URL (see [Deploying](#deploying-to-cloudflare)), e.g.
   `https://snag.<your-account>.workers.dev`, and press **New Life**.
3. When Chrome or Edge asks to let the site **access devices on your local network**, click
   **Allow**. That permission is how the page reaches LM Studio on your computer. The status dot in
   the header turns green once it's connected.

No LM Studio? The game still plays, using its built-in offline event library.

**Playing on another device (phone, tablet):** the AI address in ⚙️ Settings must point at a
computer running LM Studio. A secure (https) page can't call a plain `http://192.168…` address on
every browser. The reliable way is an https tunnel to LM Studio, for example
`cloudflared tunnel --url http://localhost:1234`. Paste the `https://….trycloudflare.com/v1`
address it prints into Settings.

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
| **Server URL** | Where LM Studio is. The hosted site uses `http://localhost:1234/v1`, which needs **Enable CORS** in LM Studio. `npm run dev` uses `/lmstudio/v1` through its proxy. A tunnel URL works too. |
| **Model** | *Auto* uses whatever model LM Studio has loaded. You can also pick a specific one; LM Studio loads it on demand. |
| **API token** | Only needed if you turned on authentication in LM Studio. |
| **Structured output** | Sends a JSON schema so the model must answer in valid JSON. Turn it off if your model or backend rejects `response_format`. |
| **Skip thinking** | Asks reasoning models (Qwen 3, DeepSeek-R1, gpt-oss, …) to answer without a long think step. |
| **Content rating** | Family / Teen / Mature. The default is Teen: dark humor, nothing explicit. |
| **Temperature, max tokens, timeout** | Tuning for your model and hardware. |

## Troubleshooting

- **Red status dot / "Can't reach LM Studio"**: check that LM Studio's server is running on port
  1234, that a model is loaded, and (on the hosted site) that **Enable CORS** is on and you
  allowed local network access in the browser. In Chrome, open the 🔒 icon in the address bar
  → *Site settings* → *Local network access* → *Allow*. Then press **Test connection** in
  Settings.
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
node scripts/mock-lmstudio.mjs   # a fake LM Studio on :1234 that returns schema-shaped JSON (no model needed)
```

The engine (`src/game`) is plain TypeScript with a seeded RNG and no React. The AI layer is in
`src/ai`, and the React UI is in `src/ui`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for
how the pieces fit together.
