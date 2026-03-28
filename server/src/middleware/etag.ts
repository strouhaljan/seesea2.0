import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export function etagMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown) {
    const serialized = JSON.stringify(body);
    const hash = createHash("md5").update(serialized).digest("hex");
    const etag = `"${hash}"`;

    res.setHeader("ETag", etag);

    if (_req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return res;
    }

    return originalJson(body);
  };

  next();
}
