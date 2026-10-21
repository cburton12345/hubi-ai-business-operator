import type { Config } from "@netlify/functions";
import { handleFerocityMcpRequest } from "../../src/lib/mcp/server";

export default async function handler(request: Request) {
  return handleFerocityMcpRequest(request);
}

export const config: Config = {
  path: "/mcp",
  rateLimit: {
    windowLimit: 180,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
