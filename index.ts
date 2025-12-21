import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import index from "./index.html";
import { appRouter } from "./src/server/router";
import { createContext } from "./src/server/trpc";
import { initDB } from "./src/db";

// Initialize database on startup
await initDB();

const server = Bun.serve({
  port: 3000,
  routes: {
    // Serve frontend
    "/": index,
  },
  fetch(req) {
    const url = new URL(req.url);

    // Handle tRPC API requests
    if (url.pathname.startsWith("/api/trpc")) {
      return fetchRequestHandler({
        endpoint: "/api/trpc",
        req,
        router: appRouter,
        createContext: () => createContext(req),
      });
    }

    // 404 for other routes
    return new Response("Not Found", { status: 404 });
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`
🚀 Daimo Simple running at http://localhost:${server.port}

  Frontend: http://localhost:${server.port}/
  tRPC API: http://localhost:${server.port}/api/trpc

  Chain: Base Sepolia (testnet)
`);
