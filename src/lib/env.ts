import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  ADMIN_ACCESS_TOKEN: z.string().min(16).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().min(1).optional(),
  GA4_PROPERTY_ID: z.string().min(1).optional(),
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_OAUTH_REDIRECT_URI: z.string().url().optional(),
  EMAIL_PROVIDER: z.string().min(1).optional(),
  EMAIL_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_FROM_NUMBER: z.string().min(1).optional(),
  REVIEW_PROVIDER: z.string().min(1).optional(),
  REVIEW_API_KEY: z.string().min(1).optional(),
  CALENDAR_PROVIDER: z.string().min(1).optional(),
  CALENDAR_CLIENT_ID: z.string().min(1).optional(),
  CALENDAR_CLIENT_SECRET: z.string().min(1).optional(),
  CALENDAR_OAUTH_REDIRECT_URI: z.string().url().optional(),
  MARKETPLACEPRO_WEBHOOK_SECRET: z.string().min(16).optional()
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ADMIN_ACCESS_TOKEN: process.env.ADMIN_ACCESS_TOKEN,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
  GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID,
  META_APP_ID: process.env.META_APP_ID,
  META_APP_SECRET: process.env.META_APP_SECRET,
  META_OAUTH_REDIRECT_URI: process.env.META_OAUTH_REDIRECT_URI,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  EMAIL_API_KEY: process.env.EMAIL_API_KEY,
  EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
  REVIEW_PROVIDER: process.env.REVIEW_PROVIDER,
  REVIEW_API_KEY: process.env.REVIEW_API_KEY,
  CALENDAR_PROVIDER: process.env.CALENDAR_PROVIDER,
  CALENDAR_CLIENT_ID: process.env.CALENDAR_CLIENT_ID,
  CALENDAR_CLIENT_SECRET: process.env.CALENDAR_CLIENT_SECRET,
  CALENDAR_OAUTH_REDIRECT_URI: process.env.CALENDAR_OAUTH_REDIRECT_URI,
  MARKETPLACEPRO_WEBHOOK_SECRET: process.env.MARKETPLACEPRO_WEBHOOK_SECRET
});

export function hasSupabaseBrowserConfig() {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function hasSupabaseAdminConfig() {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function missingEnvVars(keys: (keyof typeof env)[]) {
  return keys.filter((key) => !env[key]);
}
