// Just enough of Deno's globals for `npm run typecheck:functions` to check the
// edge functions with the app's TypeScript (Deno itself is not installed here).
declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
  const env: { get(key: string): string | undefined };
}
