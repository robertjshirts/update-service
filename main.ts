import "@std/dotenv/load"
import { getRequestInfo, Logger } from "./utils.ts";

const LOG_FILE = Deno.env.get("LOG_FILE") || undefined; // Catch any nullish values and set to undefined
const PORT = Deno.env.get("PORT") || 8088;
const logger = new Logger(LOG_FILE);

const AUTH_KEY = Deno.env.get("AUTH_KEY");
if (!AUTH_KEY) {
  await logger.error("Missing AUTH_KEY environment variable");
  Deno.exit(1);
}

const SERVICES_DIR = "~/projects/services";

// Get allowed services from dir
const ACCEPTED_SERVICES = Deno.readDirSync(SERVICES_DIR)
  .filter((dir) => dir.isDirectory)
  .map((dir) => dir.name)
  .toArray();

// Define accepted tags
const ACCEPTED_TAGS = ["release", "main"]

Deno.serve({
  port: Number(PORT),
  onListen: 
    async ({ port, hostname}) => {
      await logger.log(`Server listening on ${hostname}:${port}`);
    },
  },
  async (req) => {
  // Health check
  const url = new URL(req.url);
  if (url.pathname === "/health") {
    return new Response("OK", { status: 200 });
  }
  
  // Check header
  if (req.headers.get("Authorization") !== AUTH_KEY) {
    const requestInfo = JSON.stringify(await getRequestInfo(req), null, 2);
    await logger.error(`Unauthorized request (404): ${requestInfo}`);
    return new Response("Not found", { status: 404 });
  }

  // Get body json
  if (!req.body) {
    await logger.error("Missing request body (400)");
    return new Response("Need JSON body", { status: 400 });
  }
  
  let body;
  try {
    body = await req.json();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse JSON';
    await logger.error(`Invalid JSON body (400): ${errorMessage}`);
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!body.service || !body.tag) {
    await logger.error(`Missing required fields (400): ${JSON.stringify({ body }, null, 2)}`);
    return new Response("Missing service or tag in body", { status: 400 });
  }

  // Check service and tag
  if (!ACCEPTED_SERVICES.includes(body.service)) {
    await logger.error(`Invalid service requested (400): ${body.service}. Accepted services: ${ACCEPTED_SERVICES.join(", ")}`);
    return new Response(`Service must be one of ${ACCEPTED_SERVICES.join(", ")}`, { status: 400 });
  }
  
  if (!ACCEPTED_TAGS.includes(body.tag)) {
    await logger.error(`Invalid tag requested (400): ${body.tag}. Accepted tags: ${ACCEPTED_TAGS.join(", ")}`);
    return new Response(`Tag must be one of ${ACCEPTED_TAGS.join(", ")}. Did you forget to update the code and redeploy it?`, { status: 400 });
  }

  const composeFile = `${SERVICES_DIR}/${body.service}/docker-compose.yml`;

  // Pull docker image
  const image = new Deno.Command(`docker pull ghcr.io/robertjshirts/${body.service}:${body.tag}`);
  const imageStatus = await image.spawn().output();
  if (imageStatus.code !== 0) {
    const errorOutput = new TextDecoder().decode(imageStatus.stderr);
    await logger.error(`Docker pull failed (500):\nError: ${errorOutput}`);
    return new Response("Docker pull failed", { status: 500 });
  }

  // Run docker compose
  const compose = new Deno.Command(`docker compose -f ${composeFile} restart ${body.service}`); 
  const composeStatus = await compose.spawn().output();
  if (composeStatus.code !== 0) {
    const errorOutput = new TextDecoder().decode(composeStatus.stderr);
    await logger.error(`Docker compose restart failed (500):\nError: ${errorOutput}`);
    return new Response("Docker compose restart failed", { status: 500 });
  }

  await logger.log(`Successfully updated ${body.service} to ${body.tag}`);

  return new Response("Success", { status: 200 });
})
