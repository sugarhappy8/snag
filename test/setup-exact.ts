// R3-H1 (H.3): every test file starts in Exact mode (vite.config.ts setupFiles). The game's default is Realistic (estimates,
// ranges and words), and the Fog track turns numbers into those; the existing hint, menu and report tests pin exact text, so the
// whole suite runs in Exact and they pass unchanged. A Fog test flips the mode for one call with withInfoMode(m, fn), or with
// inFog(fn) from test/knowledge-kit.ts. The override beats the player's setting, so a file that imports the store (which applies
// the setting at load) is still Exact. See src/game/knowledge/mode.ts.
import { setInfoOverride } from '../src/game/knowledge/mode'

setInfoOverride('exact')
