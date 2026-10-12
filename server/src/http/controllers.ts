import type { Request, Response } from "express";
import mongoose from "mongoose";
import {
  cellIdParamSchema,
  createSessionBodySchema,
  leaderboardQuerySchema,
  type ClaimResponse,
  type SessionResponse,
} from "@gridrush/shared";
import { AppError } from "../errors.js";
import { parse } from "./middleware.js";
import { createSession, touchUser } from "../services/sessionService.js";
import { claimCell, getLeaderboard, getSnapshot } from "../services/boardService.js";
import type { Broadcaster } from "../realtime/socket.js";

export function createControllers(broadcaster: Broadcaster) {
  return {
    health(_req: Request, res: Response) {
      const dbUp = mongoose.connection.readyState === 1;
      res.status(dbUp ? 200 : 503).json({ ok: dbUp, db: dbUp ? "up" : "down", uptime: Math.round(process.uptime()) });
    },

    /** POST /api/session — create an anonymous player. */
    async createSession(req: Request, res: Response) {
      const body = parse(createSessionBodySchema, req.body);
      const { user, token } = await createSession(body.displayName);
      const payload: SessionResponse = { user, token };
      res.status(201).json(payload);
    },

    /** GET /api/session — who am I (validates a stored token). */
    async getSession(req: Request, res: Response) {
      const user = req.user!;
      touchUser(user.id).catch(() => undefined);
      const payload: SessionResponse = { user };
      res.json(payload);
    },

    /** GET /api/board — full snapshot, same shape the socket sends. */
    async getBoard(_req: Request, res: Response) {
      res.json(await getSnapshot());
    },

    /** GET /api/leaderboard?limit=&offset= */
    async getLeaderboard(req: Request, res: Response) {
      const { limit, offset } = parse(leaderboardQuerySchema, req.query);
      res.json(await getLeaderboard(limit, offset));
    },

    /** POST /api/cells/:cellId/claim */
    async claim(req: Request, res: Response) {
      const cellId = parse(cellIdParamSchema, req.params.cellId);
      if (req.body && Object.keys(req.body).length > 0) {
        throw AppError.validation("This endpoint takes no request body");
      }
      const result = await claimCell(cellId, req.user!);

      if (result.kind === "claimed") {
        // Only now — after the database confirmed the write — tell everyone.
        broadcaster.cellClaimed({
          cellId: result.cell.cellId,
          ownerId: result.owner.id,
          owner: result.owner,
          claimedAt: result.cell.claimedAt!,
          version: result.cell.version,
        });
      }

      const payload: ClaimResponse = {
        cell: result.cell,
        owner: result.owner,
        alreadyOwned: result.kind === "alreadyOwned",
      };
      res.status(result.kind === "claimed" ? 201 : 200).json(payload);
    },
  };
}
