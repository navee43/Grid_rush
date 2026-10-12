import { Router } from "express";
import type { Config } from "../config.js";
import type { Broadcaster } from "../realtime/socket.js";
import { createControllers } from "./controllers.js";
import { asyncHandler, createRateLimiters, requireUser } from "./middleware.js";

export function createApiRouter(config: Config, broadcaster: Broadcaster) {
  const c = createControllers(broadcaster);
  const limits = createRateLimiters(config);
  const router = Router();

  router.get("/health", c.health);

  router.use(limits.api);

  router.post("/session", limits.session, asyncHandler(c.createSession));
  router.get("/session", requireUser, asyncHandler(c.getSession));

  router.get("/board", asyncHandler(c.getBoard));
  router.get("/leaderboard", asyncHandler(c.getLeaderboard));

  router.post("/cells/:cellId/claim", limits.claim, requireUser, asyncHandler(c.claim));

  return router;
}
