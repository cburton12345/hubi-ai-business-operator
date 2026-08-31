import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { POST as pair } from "../../../src/app/api/ferocity-connect/device/pair/route";
import { POST as heartbeat } from "../../../src/app/api/ferocity-connect/device/heartbeat/route";
import { GET as nextJob } from "../../../src/app/api/ferocity-connect/device/jobs/next/route";
import { POST as inbound } from "../../../src/app/api/ferocity-connect/device/inbound/route";
import { POST as rotateCredential } from "../../../src/app/api/ferocity-connect/device/rotate-credential/route";
import { POST as jobStatus } from "../../../src/app/api/ferocity-connect/device/jobs/[jobId]/status/route";

const port = Number(process.env.FEROCITY_CONNECT_PORT ?? 8787);
const maxBodyBytes = 128 * 1024;

async function requestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("body_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function webRequest(request: IncomingMessage, body: Buffer) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  }
  const method = request.method ?? "GET";
  return new Request(`http://ferocity-connect.internal${request.url ?? "/"}`, {
    method, headers, body: method === "GET" || method === "HEAD" ? undefined : Uint8Array.from(body)
  });
}

async function send(response: ServerResponse, webResponse: Response) {
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => response.setHeader(key, value));
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://ferocity-connect.internal");
    if (request.method === "GET" && url.pathname === "/health") {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ ok: true, service: "ferocity-connect" }));
      return;
    }
    const body = await requestBody(request);
    const web = webRequest(request, body);
    let result: Response | null = null;
    if (request.method === "POST" && url.pathname === "/api/ferocity-connect/device/pair") result = await pair(web);
    else if (request.method === "POST" && url.pathname === "/api/ferocity-connect/device/heartbeat") result = await heartbeat(web);
    else if (request.method === "GET" && url.pathname === "/api/ferocity-connect/device/jobs/next") result = await nextJob(web);
    else if (request.method === "POST" && url.pathname === "/api/ferocity-connect/device/inbound") result = await inbound(web);
    else if (request.method === "POST" && url.pathname === "/api/ferocity-connect/device/rotate-credential") result = await rotateCredential(web);
    else {
      const statusMatch = request.method === "POST" ? url.pathname.match(/^\/api\/ferocity-connect\/device\/jobs\/([0-9a-f-]{36})\/status$/i) : null;
      if (statusMatch) result = await jobStatus(web, { params: Promise.resolve({ jobId: statusMatch[1] }) });
    }
    if (!result) result = Response.json({ ok: false, error: "Not found." }, { status: 404 });
    await send(response, result);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "body_too_large";
    response.writeHead(tooLarge ? 413 : 500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ok: false, error: tooLarge ? "Request body is too large." : "Service request failed." }));
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Ferocity Connect device plane listening on ${port}`);
});
