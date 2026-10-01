export type WorkforceRuntimeKey = "ferocity_native" | "connected_agent";

export type WorkforceRuntimeContext = {
  tenantId: string;
  workflowId: string;
  runId: string;
  departmentKey: string;
};

export type WorkforceRuntimeResult<T> = {
  runtimeKey: WorkforceRuntimeKey;
  result: T;
};

/** Ferocity owns context, authority, audit, and outcomes; the runtime is replaceable infrastructure. */
export async function executeWorkforceRuntime<T>(input: {
  runtimeKey?: WorkforceRuntimeKey;
  context: WorkforceRuntimeContext;
  nativeExecute: () => Promise<T>;
}): Promise<WorkforceRuntimeResult<T>> {
  const runtimeKey = input.runtimeKey ?? "ferocity_native";
  if (runtimeKey !== "ferocity_native") {
    throw new Error(`Workforce runtime ${runtimeKey} is not activated for this workspace. Connected agents must be authenticated, scoped, audited, and certified before use.`);
  }
  return { runtimeKey, result: await input.nativeExecute() };
}
