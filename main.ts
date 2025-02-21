import "@std/dotenv/load"
import { getRequestInfo } from "./utils.ts";
console.log("Starting server...");

const LOG_FILE = Deno.env.get("LOG_FILE") || "log.txt";
const PORT = Deno.env.get("PORT") || 8088;

const AUTH_KEY = Deno.env.get("AUTH_KEY");
if (!AUTH_KEY) {
  console.error("Missing AUTH_KEY environment variable");
  Deno.exit(1);
}

const SERVICES_DIR = "~/projects/services";

// Get allowed services from dir
const ACCEPTED_SERVICES = Deno.readDirSync(SERVICES_DIR)
  .filter((dir) => dir.isDirectory)
  .map((dir) => dir.name)
  .toArray();
const ACCEPTED_TAGS = ["release", "main"]

Deno.serve(async (req) => {
  // Health check
  const url = new URL(req.url);
  if (url.pathname === "/health") {
    return new Response("OK", { status: 200 });
  }
  
  // Check header
  if (req.headers.get("Authorization") !== AUTH_KEY) {
    const requestInfo = JSON.stringify(await getRequestInfo(req), null, 2);
    Deno.writeTextFile(LOG_FILE, `[${new Date().toISOString()}] Unauthorized request (404): ${requestInfo}\n`, { append: true });
    return new Response("Not found", { status: 404 });
  }

  // Get body json
  if (!req.body) {
    Deno.writeTextFile(LOG_FILE, `[${new Date().toISOString()}] Missing request body (400)\n`, { append: true });
    return new Response("Need JSON body", { status: 400 });
  }
  
  let body;
  try {
    body = await req.json();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse JSON';
    Deno.writeTextFile(LOG_FILE, `[${new Date().toISOString()}] Invalid JSON body (400): ${errorMessage}\n`, { append: true });
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!body.service || !body.tag) {
    Deno.writeTextFile(LOG_FILE, `[${new Date().toISOString()}] Missing required fields (400): ${JSON.stringify({ body }, null, 2)}\n`, { append: true });
    return new Response("Missing service or tag in body", { status: 400 });
  }

  // Check service and tag
  if (!ACCEPTED_SERVICES.includes(body.service)) {
    Deno.writeTextFile(LOG_FILE, `[${new Date().toISOString()}] Invalid service requested (400): ${body.service}. Accepted services: ${ACCEPTED_SERVICES.join(", ")}\n`, { append: true });
    return new Response(`Service must be one of ${ACCEPTED_SERVICES.join(", ")}`, { status: 400 });
  }
  
  if (!ACCEPTED_TAGS.includes(body.tag)) {
    Deno.writeTextFile(LOG_FILE, `[${new Date().toISOString()}] Invalid tag requested (400): ${body.tag}. Accepted tags: ${ACCEPTED_TAGS.join(", ")}\n`, { append: true });
    return new Response(`Tag must be one of ${ACCEPTED_TAGS.join(", ")}. Did you forget to update the code and redeploy it?`, { status: 400 });
  }

  const composeFile = `${SERVICES_DIR}/${body.service}/docker-compose.yml`;

  // Pull docker image
  const image = new Deno.Command(`docker pull ghcr.io/robertjshirts/${body.service}:${body.tag}`);
  const imageStatus = await image.spawn().output();
  if (imageStatus.code !== 0) {
    const errorOutput = new TextDecoder().decode(imageStatus.stderr);
    Deno.writeTextFile(LOG_FILE, `[${new Date().toISOString()}] Docker pull failed (500):\nError: ${errorOutput}\n`, { append: true });
    console.error("Docker pull failed:", errorOutput);
    return new Response("Docker pull failed", { status: 500 });
  }

  // Run docker compose
  const compose = new Deno.Command(`docker compose -f ${composeFile} restart ${body.service}`); 
  const composeStatus = await compose.spawn().output();
  if (composeStatus.code !== 0) {
    const errorOutput = new TextDecoder().decode(composeStatus.stderr);
    Deno.writeTextFile(LOG_FILE, `[${new Date().toISOString()}] Docker compose restart failed (500):\nError: ${errorOutput}\n`, { append: true });
    console.error("Docker compose restart failed:", errorOutput);
    return new Response("Docker compose restart failed", { status: 500 });
  }

  return new Response("Success", { status: 200 });
})
