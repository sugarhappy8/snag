# AnotherLife v4.1.1

One security update to the build tools. Nothing in the game changes. Saves from v4.1.0 load unchanged.

## Fixes

- **The dev server's open-in-editor link had three security holes.** Vite 8.3.0 to 8.3.2 ships a
  version of `launch-editor` that can misread a crafted file path: on some editors it could run a
  command, and on Windows it could skip an escape or a file check (GHSA-r825-w8mm-5pxw,
  GHSA-698v-4r3x-3vcv, GHSA-587h-7wmj-h5pm). Vite is now 8.3.5, which carries the fixed version.
  The link only exists in `npm run dev`, so the published game never ran this code. `npm audit`
  now reports no vulnerabilities.
