export function json(statusCode: number, body: unknown, allowedOrigin: string) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // Fixed to the one legitimate frontend origin — never reflects the caller's Origin header.
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}
