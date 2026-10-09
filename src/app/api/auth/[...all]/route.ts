import type { NextRequest } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { recordMetric } from "@/lib/metrics";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

const handlers = toNextJsHandler(auth);

const RULES = [
  {
    scope: "auth:sign-in",
    test: (path: string) => path.includes("/sign-in"),
    limit: 10,
    windowSeconds: 60,
  },
  {
    scope: "auth:sign-up",
    test: (path: string) => path.includes("/sign-up"),
    limit: 5,
    windowSeconds: 300,
  },
];

export const GET = handlers.GET;

export async function POST(request: NextRequest) {
  const path = new URL(request.url).pathname;
  const rule = RULES.find((candidate) => candidate.test(path));

  if (rule) {
    const result = await checkRateLimit({
      key: clientKey(request.headers, rule.scope),
      limit: rule.limit,
      windowSeconds: rule.windowSeconds,
    });

    if (!result.allowed) {
      logger.warn("rate_limited", { scope: rule.scope, path });
      recordMetric("rate_limited", 1, { scope: rule.scope });
      return Response.json(
        { error: "Muitas tentativas. Aguarde e tente novamente." },
        {
          status: 429,
          headers: { "retry-after": String(result.retryAfterSeconds) },
        },
      );
    }
  }

  return handlers.POST(request);
}
