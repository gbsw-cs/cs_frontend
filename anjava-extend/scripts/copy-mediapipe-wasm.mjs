import { cpSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = resolve(projectRoot, "assets", "mediapipe-wasm")
const destination = resolve(projectRoot, "build", "chrome-mv3-prod", "assets", "mediapipe-wasm")
const postureImages = ["turtleneck.png", "slouch.png", "round-shoulder.png", "shoulder-notsame.png"]
const buildAssets = resolve(projectRoot, "build", "chrome-mv3-prod", "assets")

mkdirSync(destination, { recursive: true })
cpSync(source, destination, { recursive: true })
mkdirSync(buildAssets, { recursive: true })
for (const image of postureImages) {
  cpSync(resolve(projectRoot, "assets", image), resolve(buildAssets, image))
}
