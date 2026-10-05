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

## Quick start

You need [Node.js](https://nodejs.org) 20 or newer and [LM Studio](https://lmstudio.ai).

1. **Set up LM Studio**
   1. Install LM Studio and download a chat/instruct model. Good choices are a 7–14B instruct
      model such as Qwen 3, Llama 3.x, Gemma 3 or Mistral at Q4/Q5. Smaller models work but write
      blander stories.
   2. Open the **Developer** tab, load the model and switch **Start Server** on. It listens on
      `http://localhost:1234` by default. You can also run `lms server start` from the command line.
2. **Run the game**
   ```bash
   npm install
   npm run dev
   ```
   Then open <http://localhost:5173>.
3. Press **New Life**. The status dot in the header turns green once the game reaches LM Studio.

The dev server forwards `/lmstudio/*` to LM Studio, so you **don't** need to enable CORS in LM
Studio. If LM Studio runs on a different machine or port, start the game with:

```bash
LMSTUDIO_URL=http://192.168.1.50:1234 npm run dev
```

## Settings (⚙️)

| Setting | What it does |
|---|---|
| **AI narration** | *Off*: fully offline. *Balanced* (default): the AI writes events, outcomes, conversations, interviews, "Do Anything" and obituaries. *Full*: the AI also rewrites every activity result (slower). |
| **Server URL** | `/lmstudio/v1` (through the dev-server proxy) or an absolute URL such as `http://localhost:1234/v1`. An absolute URL needs **Enable CORS** turned on in LM Studio's server settings. |
| **Model** | *Auto* uses whatever model LM Studio has loaded. You can also pick a specific one; LM Studio loads it on demand. |
| **API token** | Only needed if you turned on authentication in LM Studio. |
| **Structured output** | Sends a JSON schema so the model must answer in valid JSON. Turn it off if your model or backend rejects `response_format`. |
| **Skip thinking** | Asks reasoning models (Qwen 3, DeepSeek-R1, gpt-oss, …) to answer without a long think step. |
| **Content rating** | Family / Teen / Mature. The default is Teen: dark humor, nothing explicit. |
| **Temperature, max tokens, timeout** | Tuning for your model and hardware. |

## Troubleshooting

- **Red status dot / "Can't reach LM Studio"**: check that LM Studio's server is running on port
  1234 and that a model is loaded. Then press **Test connection** in Settings.
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
node scripts/mock-lmstudio.mjs   # a fake LM Studio on :1234 that returns schema-shaped JSON (no model needed)
```

The engine (`src/game`) is plain TypeScript with a seeded RNG and no React. The AI layer is in
`src/ai`, and the React UI is in `src/ui`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for
how the pieces fit together.
