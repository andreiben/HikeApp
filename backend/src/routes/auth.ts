import { Hono } from "hono";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../schema/users";

const authRouter = new Hono();
const passwordResetCodes = new Map<string, { code: string; expiresAt: number }>();

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});

const forgotPasswordSchema = z.object({
  email: z.email(),
});

const resetPasswordSchema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(6),
});

function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

authRouter.post("/register", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    const { email, password } = parsed.data;

    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return c.json({ error: "Email already in use" }, 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      await db.insert(users).values({
        email,
        passwordHash,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unique|duplicate/i.test(message)) {
        return c.json(
          { error: "An account with this email already exists." },
          409
        );
      }

      throw error;
    }

    return c.json({ message: "User created successfully" }, 201);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

authRouter.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    const { email, password } = parsed.data;

    const foundUsers = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

      const user = foundUsers[0];

    if (!user) {
      return c.json({ error: "Invalid credentials" }, 401);
    }


    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
      },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: "7d" }
    );

    return c.json({
      message: "Login successful",
      accessToken,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

authRouter.post("/forgot-password", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    const { email } = parsed.data;
    const resetCode = generateResetCode();
    const expiresAt = Date.now() + 15 * 60 * 1000;

    const foundUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (foundUsers[0]) {
      passwordResetCodes.set(email, { code: resetCode, expiresAt });
    }

    return c.json({
      message: "If that email exists, a reset code was sent.",
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

authRouter.post("/reset-password", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    const { email, code, newPassword } = parsed.data;
    const storedReset = passwordResetCodes.get(email);

    if (
      !storedReset ||
      storedReset.code !== code ||
      storedReset.expiresAt < Date.now()
    ) {
      passwordResetCodes.delete(email);
      return c.json({ error: "Invalid or expired reset code." }, 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updatedUsers = await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.email, email))
      .returning({ id: users.id });

    passwordResetCodes.delete(email);

    if (updatedUsers.length === 0) {
      return c.json({ error: "Invalid or expired reset code." }, 400);
    }

    return c.json({ message: "Password reset successful." });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default authRouter;
