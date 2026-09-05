import type { Context } from "hono";
import * as jwt from "jsonwebtoken";

type AuthUser = {
  sub: string;
  email: string;
};

export function getAuthUser(c: Context): AuthUser | null {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return null;
  }

  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return null;
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET!
    ) as AuthUser;

    return payload;
  } catch {
    return null;
  }
}