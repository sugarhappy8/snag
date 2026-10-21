# Previews

A preview is a copy of a branch you can open on your phone before it merges. It doesn't touch the live game.
Every track branch (`claude/**`) and the release branch (`release/**`) can get one.

## Getting previews

There are two ways. Pick one. Neither can be proven from the repo: the first real run is the test.

1. **A token.** Add the repository secret `CLOUDFLARE_API_TOKEN`, an "Edit Cloudflare Workers" token, the same one
   `deploy.yml` wants. Then `.github/workflows/preview.yml` runs on each push to those branches. It builds the
   branch and uploads a version of the Worker `snag` under an alias made from the branch name, without making it
   live. The run summary lists the address. Without the secret the workflow prints a notice and skips.
2. **Workers Builds.** In the Cloudflare dashboard, open the Worker `snag`, then Settings, then Builds, and turn on
   builds for non-production branches. No code change is needed. Cloudflare builds each branch and posts the address.

## Opening one

Open the address from the run summary (or from Cloudflare) on your phone. A feature that ships dark looks like the
live game until you switch it on. The eight R1 features are on by default from v4.1.0, and `?flags=none` shows the
screens without them.

## Switching features on

The switches live in `src/game/flags.ts`. Add `?flags=` to the address:

- `?flags=all` turns every switch on, and `?flags=none` turns every switch off.
- `?flags=chartKit,navPalette` turns those two on.
- `?flags=all,-cockpits` turns all on but one off. Names aren't case sensitive and unknown names are ignored.
- The list can be 200 characters and 20 names at most, or it's ignored.

To keep a list between visits, set `localStorage['anotherlife.flags']` to the same text in the browser console.
The address wins over the stored list, and the stored list wins over the defaults. An address with `?flags=` replaces
the stored list for that visit; it doesn't add to it.

## What previews and flags are for

In R1 the flags change what you see, not what happens in a life. A preview plays the same life as the live game
for the same seed. A flag never changes the meaning of a saved field, and each preview address keeps its own saves
and its own stored list, apart from the live game.
