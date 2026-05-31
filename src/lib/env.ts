import { z } from "zod";

const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());
const optionalEmail = z.preprocess((value) => (value === "" ? undefined : value), z.string().email().optional());

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  ADMIN_ACCESS_TOKEN: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(16).optional()),
  DATABASE_URL: optionalString,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  STRIPE_PRICE_ID_STARTER: optionalString,
  STRIPE_PRICE_ID_GROWTH: optionalString,
  STRIPE_PRICE_ID_OPERATOR: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_OAUTH_REDIRECT_URI: optionalUrl,
  GOOGLE_ADS_DEVELOPER_TOKEN: optionalString,
  GA4_PROPERTY_ID: optionalString,
  REDDIT_CLIENT_ID: optionalString,
  REDDIT_CLIENT_SECRET: optionalString,
  REDDIT_OAUTH_REDIRECT_URI: optionalUrl,
  META_APP_ID: optionalString,
  META_APP_SECRET: optionalString,
  META_OAUTH_REDIRECT_URI: optionalUrl,
  MICROSOFT_CLIENT_ID: optionalString,
  MICROSOFT_CLIENT_SECRET: optionalString,
  MICROSOFT_OAUTH_REDIRECT_URI: optionalUrl,
  MICROSOFT_ADS_DEVELOPER_TOKEN: optionalString,
  YAHOO_CLIENT_ID: optionalString,
  YAHOO_CLIENT_SECRET: optionalString,
  YAHOO_OAUTH_REDIRECT_URI: optionalUrl,
  EMAIL_PROVIDER: optionalString,
  EMAIL_API_KEY: optionalString,
  EMAIL_FROM_ADDRESS: optionalEmail,
  FEROCITY_NOTIFY_EMAIL: optionalEmail,
  FEROCITY_APP_URL: optionalUrl,
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_FROM_NUMBER: optionalString,
  REVIEW_PROVIDER: optionalString,
  REVIEW_API_KEY: optionalString,
  CALENDAR_PROVIDER: optionalString,
  CALENDAR_CLIENT_ID: optionalString,
  CALENDAR_CLIENT_SECRET: optionalString,
  CALENDAR_OAUTH_REDIRECT_URI: optionalUrl,
  MARKETPLACEPRO_WEBHOOK_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(16).optional())
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
  STRIPE_PRICE_ID_STARTER: process.env.STRIPE_PRICE_ID_STARTER,
  STRIPE_PRICE_ID_GROWTH: process.env.STRIPE_PRICE_ID_GROWTH,
  STRIPE_PRICE_ID_OPERATOR: process.env.STRIPE_PRICE_ID_OPERATOR,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
  GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID,
  REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
  REDDIT_OAUTH_REDIRECT_URI: process.env.REDDIT_OAUTH_REDIRECT_URI,
  META_APP_ID: process.env.META_APP_ID,
  META_APP_SECRET: process.env.META_APP_SECRET,
  META_OAUTH_REDIRECT_URI: process.env.META_OAUTH_REDIRECT_URI,
  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
  MICROSOFT_OAUTH_REDIRECT_URI: process.env.MICROSOFT_OAUTH_REDIRECT_URI,
  MICROSOFT_ADS_DEVELOPER_TOKEN: process.env.MICROSOFT_ADS_DEVELOPER_TOKEN,
  YAHOO_CLIENT_ID: process.env.YAHOO_CLIENT_ID,
  YAHOO_CLIENT_SECRET: process.env.YAHOO_CLIENT_SECRET,
  YAHOO_OAUTH_REDIRECT_URI: process.env.YAHOO_OAUTH_REDIRECT_URI,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  EMAIL_API_KEY: process.env.EMAIL_API_KEY,
  EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
  FEROCITY_NOTIFY_EMAIL: process.env.FEROCITY_NOTIFY_EMAIL,
  FEROCITY_APP_URL: process.env.FEROCITY_APP_URL,
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
