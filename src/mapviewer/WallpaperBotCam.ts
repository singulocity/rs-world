import { LiveController } from "../live/LiveController";
import { Camera } from "./Camera";

// Players closer than glideMaxTiles get a smooth glide; farther ones a fade-out/cut/fade-in.
export const DEFAULT_GLIDE_MAX_TILES = 64;
const GLIDE_MS_PER_TILE = 120;
const GLIDE_MIN_MS = 2000;
const GLIDE_MAX_MS = 6000;
const FADE_MS = 800;
// After a cut, stay dark until the player has streamed in and had time to settle.
const SETTLE_MS = 1500;
const LOAD_TIMEOUT_MS = 8000;

type State = "watch" | "fadeOut" | "loading" | "fadeIn";

// Wallpaper "bot cam": follows a random online player for dwellMs, then moves on to another.
export class WallpaperBotCam {
    // 0 = clear, 1 = fully faded to black. The container draws the overlay.
    fade = 0;

    private state: State = "watch";
    private nextSwitch = 0;
    private target?: string;
    private stateStart = 0;
    private foundAt = 0;

    constructor(
        public dwellMs: number,
        public glideMaxTiles: number = DEFAULT_GLIDE_MAX_TILES,
    ) {}

    update(live: LiveController, camera: Camera, deltaTime: number): void {
        const now = performance.now();
        switch (this.state) {
            case "watch": {
                if (live.world.rosterTick === -1) {
                    return;
                }
                const current = live.followName?.toLowerCase();
                const online =
                    current !== undefined &&
                    live.world.rosterPlayers.some((p) => p[1].toLowerCase() === current);
                if (!online || now >= this.nextSwitch) {
                    this.switchTarget(live, now);
                }
                break;
            }
            case "fadeOut":
                this.fade = Math.min(this.fade + deltaTime / FADE_MS, 1);
                if (this.fade >= 1) {
                    if (this.target && live.jumpToPlayer(this.target, camera)) {
                        this.state = "loading";
                        this.stateStart = now;
                        this.foundAt = 0;
                    } else {
                        this.state = "fadeIn";
                    }
                }
                break;
            case "loading":
                if (this.foundAt === 0 && live.getPivot()) {
                    this.foundAt = now;
                }
                if (
                    (this.foundAt !== 0 && now - this.foundAt >= SETTLE_MS) ||
                    now - this.stateStart >= LOAD_TIMEOUT_MS
                ) {
                    this.state = "fadeIn";
                }
                break;
            case "fadeIn":
                this.fade = Math.max(this.fade - deltaTime / FADE_MS, 0);
                if (this.fade <= 0) {
                    this.state = "watch";
                    this.nextSwitch = now + this.dwellMs;
                }
                break;
        }
    }

    private switchTarget(live: LiveController, now: number): void {
        const roster = live.world.rosterPlayers;
        const current = live.followName?.toLowerCase();
        const others = roster.filter((p) => p[1].toLowerCase() !== current);
        if (others.length === 0) {
            // Nobody else online: keep watching whoever we have.
            this.nextSwitch = now + this.dwellMs;
            return;
        }
        const next = others[Math.floor(Math.random() * others.length)];
        this.target = next[1];

        const pivot = live.getPivot();
        if (pivot) {
            const tiles = Math.hypot(next[2] + 0.5 - pivot[0], next[3] + 0.5 - pivot[2]);
            if (tiles <= this.glideMaxTiles) {
                const duration = Math.min(
                    Math.max(tiles * GLIDE_MS_PER_TILE, GLIDE_MIN_MS),
                    GLIDE_MAX_MS,
                );
                if (live.panToPlayer(next[1], duration)) {
                    this.nextSwitch = now + this.dwellMs;
                    return;
                }
            }
        }
        this.state = "fadeOut";
    }
}
