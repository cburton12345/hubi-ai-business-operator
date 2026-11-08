const managedImageBucket = "marketing-media-assets";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isBoundedUuid(value: string) {
  return value.length === 36 && uuidPattern.test(value);
}

export function authorizedManagedImageLocation(input: { tenantId: string; assetId: string; jobId: string; bucket: string | null; path: string | null }) {
  if (![input.tenantId, input.assetId, input.jobId].every(isBoundedUuid)) return null;
  const expectedPath = `${input.tenantId}/${input.jobId}/${input.assetId}.png`;
  return input.bucket === managedImageBucket && input.path === expectedPath ? { bucket: managedImageBucket, path: expectedPath } : null;
}
