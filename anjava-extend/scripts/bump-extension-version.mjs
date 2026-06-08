import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const projectRoot = resolve(new URL(".", import.meta.url).pathname, "..")
const packagePath = resolve(projectRoot, "package.json")
const mode = process.argv[2] ?? "patch"
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"))
const current = String(packageJson.version ?? "0.0.0")
const parts = current.split(".").map((part) => Number(part))

if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
  throw new Error(`Invalid extension version: ${current}`)
}

const nextParts = [...parts]
if (mode === "major") {
  nextParts[0] += 1
  nextParts[1] = 0
  nextParts[2] = 0
} else if (mode === "minor") {
  nextParts[1] += 1
  nextParts[2] = 0
} else if (mode === "patch") {
  nextParts[2] += 1
} else {
  throw new Error("Usage: node scripts/bump-extension-version.mjs [major|minor|patch]")
}

packageJson.version = nextParts.join(".")
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
console.log(`Extension version: ${current} -> ${packageJson.version}`)
