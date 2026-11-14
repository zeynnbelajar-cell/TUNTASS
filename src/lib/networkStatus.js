export function isNetworkUnavailable(
  error,
  online = globalThis.navigator?.onLine !== false
) {
  const message = String(error?.message || error || "");
  return (
    !online ||
    /failed to fetch|network(?:error| changed)?|internet disconnected|load failed|fetch failed/i.test(message)
  );
}
