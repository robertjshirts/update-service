import "@std/dotenv/load"
console.log("Starting server...");

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
  // Check header
  if (req.headers.get("Authorization") !== AUTH_KEY) {
    return new Response("Not found", { status: 404 });
  }

  // Get body json
  if (!req.body) {
    return new Response("Not found", { status: 404 });
  }
  const body = await req.json();
  if (!body.service || !body.tag) {
    return new Response("Missing service or tag in body", { status: 400 });
  }

  // Check service and tag
  if (!ACCEPTED_SERVICES.includes(body.service)) {
    return new Response(`Service must be one of ${ACCEPTED_SERVICES.join(", ")}`, { status: 400 });
  }
  if (!ACCEPTED_TAGS.includes(body.tag)) {
    return new Response(`Tag must be one of ${ACCEPTED_TAGS.join(", ")}. Did you forget to update the code and redeploy it?`, { status: 400 });
  }

  const composeFile = `${SERVICES_DIR}/${body.service}/docker-compose.yml`;

  // Pull docker image
  const image = new Deno.Command(`docker pull ghcr.io/robertjshirts/${body.service}:${body.tag}`);
  const imageStatus = await image.spawn().output();
  if (imageStatus.code !== 0) {
    console.error(imageStatus);
    return new Response("Docker pull failed", { status: 500 });
  }

  // Run docker compose
  const compose = new Deno.Command(`docker compose -f ${composeFile} restart ${body.service}`); 
  const composeStatus = await compose.spawn().output();
  if (composeStatus.code !== 0) {
    console.error(composeStatus);
    return new Response("Docker compose restart failed", { status: 500 });
  }

  return new Response("Success", { status: 200 });
})