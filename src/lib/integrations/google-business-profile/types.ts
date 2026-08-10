export type BusinessProfileAccount = { name: string; accountName: string };

export type BusinessProfileLocation = {
  accountName: string;
  name: string;
  title: string;
  storeCode: string | null;
  websiteUri: string | null;
  primaryPhone: string | null;
  addressText: string | null;
  primaryCategory: string | null;
  verificationState: string | null;
  metadata: Record<string, unknown>;
};

export type BusinessProfileReview = {
  name: string;
  reviewerName: string | null;
  starRating: number | null;
  comment: string | null;
  createTime: string | null;
  updateTime: string | null;
  replyComment: string | null;
  replyUpdateTime: string | null;
  metadata: Record<string, unknown>;
};
