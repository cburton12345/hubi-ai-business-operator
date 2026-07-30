import { z } from "zod";

const tiktokTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  open_id: z.string().min(1),
  refresh_expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  scope: z.string().default(""),
  token_type: z.string().default("Bearer")
});

const tiktokUserResponseSchema = z.object({
  data: z.object({
    user: z.object({
      open_id: z.string().min(1),
      union_id: z.string().optional(),
      avatar_url: z.string().url().optional(),
      display_name: z.string().optional()
    })
  }),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
      log_id: z.string().optional()
    })
    .optional()
});

export type TikTokTokenSet = z.infer<typeof tiktokTokenResponseSchema>;
export type TikTokProfile = z.infer<typeof tiktokUserResponseSchema>["data"]["user"];

async function readJson(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error_description" in body
        ? String(body.error_description)
        : `TikTok returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body;
}

export async function exchangeTikTokAuthorizationCode(input: {
  clientKey: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}) {
  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: input.clientKey,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri
    }),
    cache: "no-store"
  });

  return tiktokTokenResponseSchema.parse(await readJson(response));
}

export async function fetchTikTokProfile(accessToken: string) {
  const response = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name",
    {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    }
  );
  const parsed = tiktokUserResponseSchema.parse(await readJson(response));
  if (parsed.error?.code && parsed.error.code !== "ok") {
    throw new Error(parsed.error.message || "TikTok could not return the connected profile.");
  }
  return parsed.data.user;
}

export function tokenExpiryFromNow(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
