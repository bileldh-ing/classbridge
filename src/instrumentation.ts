/** Next.js instrumentation: forwards server render/route errors to the monitoring adapter (PII-scrubbed). */
export async function register() {}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routerKind: string; routePath: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureException } = await import("./lib/monitoring");
  await captureException(err, { route: request.path, method: request.method, digest: (err as { digest?: string })?.digest, extra: { routePath: context.routePath, routerKind: context.routerKind } });
}
