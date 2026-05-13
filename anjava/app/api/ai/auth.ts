export function buildAiHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const key = process.env.AI_API_KEY;
  if (!key) return headers;

  headers["x-api-key"] = key;
  headers["api-key"] = key;
  headers.key = key;
  headers.Authorization = `Bearer ${key}`;

  return headers;
}
