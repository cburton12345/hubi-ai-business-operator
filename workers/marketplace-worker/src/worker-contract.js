export function assertMarketplaceWorkerContract(adapter) {
  for (const method of ["isRunning", "start", "stop", "inspectHealth", "collectObservations", "collectCommunitySnapshots", "executeAction"]) {
    if (typeof adapter?.[method] !== "function") throw new TypeError(`Marketplace worker adapter is missing ${method}().`);
  }
  return adapter;
}
