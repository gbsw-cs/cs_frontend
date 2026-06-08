import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"

const projectRoot = resolve(new URL(".", import.meta.url).pathname, "..")
const packagePath = resolve(projectRoot, "package.json")
const zipPath = resolve(projectRoot, "build", "chrome-mv3-prod.zip")
const buildManifestPath = resolve(projectRoot, "build", "chrome-mv3-prod", "manifest.json")
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"))

if (!existsSync(zipPath)) {
  throw new Error(`Missing extension package: ${zipPath}`)
}

if (!existsSync(buildManifestPath)) {
  throw new Error(`Missing build manifest: ${buildManifestPath}`)
}

const manifestText = execFileSync("unzip", ["-p", zipPath, "manifest.json"], {
  encoding: "utf8",
})
const zippedManifest = JSON.parse(manifestText)
const buildManifest = JSON.parse(readFileSync(buildManifestPath, "utf8"))

if (zippedManifest.manifest_version !== 3) {
  throw new Error(`Expected manifest_version 3, got ${zippedManifest.manifest_version}`)
}

if (zippedManifest.version !== packageJson.version) {
  throw new Error(
    `Zip manifest version ${zippedManifest.version} does not match package version ${packageJson.version}`,
  )
}

if (buildManifest.version !== packageJson.version) {
  throw new Error(
    `Build manifest version ${buildManifest.version} does not match package version ${packageJson.version}`,
  )
}

const matches = zippedManifest.externally_connectable?.matches
if (!Array.isArray(matches) || !matches.includes("https://anjava.vercel.app/*")) {
  throw new Error("Zip manifest is missing the production externally_connectable origin")
}

const sizeMb = statSync(zipPath).size / 1024 / 1024
console.log(
  `Verified ${zipPath}: manifest ${zippedManifest.version}, ${sizeMb.toFixed(2)} MB`,
)
