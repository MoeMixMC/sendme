import { initTRPC } from "@trpc/server";
import superjson from "superjson";

// Context for each request
export interface Context {
  ip: string;
}

export function createContext(req: Request): Context {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return { ip };
}

// Initialize tRPC
const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
