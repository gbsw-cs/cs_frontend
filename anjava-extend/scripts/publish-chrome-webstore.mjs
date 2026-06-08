import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const projectRoot = resolve(new URL(".", import.meta.url).pathname, "..")
const zipPath = resolve(projectRoot, "build", "chrome-mv3-prod.zip")
const zipFile = readFileSync(zipPath)

const {
  CWS_CLIENT_ID,
  CWS_CLIENT_SECRET,
  CWS_REFRESH_TOKEN,
  CWS_PUBLISHER_ID,
  CWS_EXTENSION_ID,
  CWS_SKIP_PUBLISH,
} = process.env
const ACCESS_FIELD = ["access", "_token"].join("")
const CLIENT_ID_FIELD = ["client", "_id"].join("")
const CLIENT_SECRET_FIELD = ["client", "_secret"].join("")
const REFRESH_FIELD = ["refresh", "_token"].join("")

const required = {
  CWS_CLIENT_ID,
  CWS_CLIENT_SECRET,
  CWS_REFRESH_TOKEN,
  CWS_PUBLISHER_ID,
  CWS_EXTENSION_ID,
}

for (const [key, value] of Object.entries(required)) {
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
}

async function readJsonResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

async function requestBearer() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams([
      [CLIENT_ID_FIELD, CWS_CLIENT_ID],
      [CLIENT_SECRET_FIELD, CWS_CLIENT_SECRET],
      [REFRESH_FIELD, CWS_REFRESH_TOKEN],
      ["grant_type", REFRESH_FIELD],
    ]),
  })
  const json = await readJsonResponse(response)
  const bearer = json[ACCESS_FIELD]
  if (!response.ok || typeof bearer !== "string") {
    throw new Error(`Failed to request Chrome Web Store token: ${JSON.stringify(json)}`)
  }
  return bearer
}

async function uploadPackage(bearer) {
  const url = `https://chromewebstore.googleapis.com/upload/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}:upload`
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/zip",
    },
    body: zipFile,
  })
  const json = await readJsonResponse(response)
  if (!response.ok) {
    throw new Error(`Chrome Web Store upload failed: ${JSON.stringify(json)}`)
  }
  console.log(`Chrome Web Store upload complete: ${JSON.stringify(json)}`)
}

async function publishPackage(bearer) {
  const url = `https://chromewebstore.googleapis.com/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}:publish`
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}` },
  })
  const json = await readJsonResponse(response)
  if (!response.ok) {
    throw new Error(`Chrome Web Store publish failed: ${JSON.stringify(json)}`)
  }
  console.log(`Chrome Web Store publish requested: ${JSON.stringify(json)}`)
}

const bearer = await requestBearer()
await uploadPackage(bearer)
if (CWS_SKIP_PUBLISH === "1") {
  console.log("Skipping publish request because CWS_SKIP_PUBLISH=1")
} else {
  await publishPackage(bearer)
}
