import {
  createBusinessProfileLocalPost,
  getBusinessProfileAttributes,
  getBusinessProfilePerformance,
  listBusinessProfileMedia,
  listBusinessProfileSearchQueries,
  updateBusinessProfileLocation,
  updateBusinessProfileReviewReply
} from "@/lib/integrations/google-business-profile/client";

export type LocalPresenceProviderContext = {
  accessToken: string;
  accountName: string;
  locationName: string;
  fetchImpl?: typeof fetch;
};

export interface LocalPresenceProviderAdapter {
  providerKey: string;
  getAttributes(context: LocalPresenceProviderContext): Promise<Record<string, unknown>>;
  getMedia(context: LocalPresenceProviderContext): Promise<Array<Record<string, unknown>>>;
  getPerformance(context: LocalPresenceProviderContext, startDate: string, endDate: string): Promise<Array<{ metric: string; date: string; value: number; breakdown: Record<string, unknown> }>>;
  getSearchQueries(context: LocalPresenceProviderContext, startMonth: string, endMonth: string): Promise<Array<{ query: string; value: number | null; threshold: number | null }>>;
  updateProfile(context: LocalPresenceProviderContext, fields: string[], patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  publishPost(context: LocalPresenceProviderContext, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  replyToReview(context: LocalPresenceProviderContext, reviewName: string, comment: string): Promise<Record<string, unknown>>;
}

export const googleBusinessProfileLocalAdapter: LocalPresenceProviderAdapter = {
  providerKey: "google_business_profile",
  async getAttributes(context) {
    return getBusinessProfileAttributes(context.locationName, context.accessToken, context.fetchImpl);
  },
  async getMedia(context) {
    return listBusinessProfileMedia(context.accountName, context.locationName, context.accessToken, context.fetchImpl);
  },
  async getPerformance(context, startDate, endDate) {
    return getBusinessProfilePerformance({ locationName: context.locationName, accessToken: context.accessToken, startDate, endDate, fetchImpl: context.fetchImpl });
  },
  async getSearchQueries(context, startMonth, endMonth) {
    return listBusinessProfileSearchQueries({ locationName: context.locationName, accessToken: context.accessToken, startMonth, endMonth, fetchImpl: context.fetchImpl });
  },
  async updateProfile(context, fields, patch) {
    return updateBusinessProfileLocation({ locationName: context.locationName, updateFields: fields, patch, accessToken: context.accessToken, fetchImpl: context.fetchImpl });
  },
  async publishPost(context, payload) {
    return createBusinessProfileLocalPost({ accountName: context.accountName, locationName: context.locationName, payload, accessToken: context.accessToken, fetchImpl: context.fetchImpl });
  },
  async replyToReview(context, reviewName, comment) {
    return updateBusinessProfileReviewReply({ reviewName, comment, accessToken: context.accessToken, fetchImpl: context.fetchImpl });
  }
};

const adapters: Record<string, LocalPresenceProviderAdapter> = {
  google_business_profile: googleBusinessProfileLocalAdapter
};

export function getLocalPresenceProviderAdapter(providerKey: string) {
  return adapters[providerKey] ?? null;
}
