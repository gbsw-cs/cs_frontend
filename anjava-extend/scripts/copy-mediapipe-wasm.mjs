import { cpSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = resolve(projectRoot, "assets", "mediapipe-wasm")
const destination = resolve(projectRoot, "build", "chrome-mv3-prod", "assets", "mediapipe-wasm")

mkdirSync(destination, { recursive: true })
cpSync(source, destination, { recursive: true })
