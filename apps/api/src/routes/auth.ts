import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, gt } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { loginSchema } from "@restai/validators";
import { hashPassword, verifyPassword } from "../lib/hash.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt.js";
import { authMiddleware } from "../middleware/auth.js";
import { t } from "../lib/i18n.js";

const auth = new Hono<AppEnv>();

// Không có đường tự đăng ký: tài khoản do quản lý tạo trong màn Nhân viên.
// (Gỡ 28/10/2026 — cửa tự tạo tổ chức + admin của RestAI gốc đang mở công khai.)

// POST /login
auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!user || !user.is_active) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: t(c, "invalid_credentials") } },
      401,
    );
  }

  const valid = await verifyPassword(user.password_hash, password);
  if (!valid) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: t(c, "invalid_credentials") } },
      401,
    );
  }

  // Get user branches
  const userBranches = await db
    .select({ branch_id: schema.userBranches.branch_id })
    .from(schema.userBranches)
    .where(eq(schema.userBranches.user_id, user.id));

  const branchIds = userBranches.map((ub) => ub.branch_id);

  const accessToken = await signAccessToken({
    sub: user.id,
    org: user.organization_id,
    role: user.role,
    branches: branchIds,
  });
  const refreshToken = await signRefreshToken({ sub: user.id });

  // Store refresh token
  const tokenHash = await hashPassword(refreshToken);
  await db.insert(schema.refreshTokens).values({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organization_id,
        branches: branchIds,
      },
      accessToken,
      refreshToken,
    },
  });
});

// POST /refresh
auth.post(
  "/refresh",
  zValidator("json", z.object({ refreshToken: z.string() })),
  async (c) => {
    const { refreshToken } = c.req.valid("json");

    let payload: any;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch {
      return c.json(
        { success: false, error: { code: "UNAUTHORIZED", message: t(c, "token_expired") } },
        401,
      );
    }

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .limit(1);

    if (!user || !user.is_active) {
      return c.json(
        { success: false, error: { code: "UNAUTHORIZED", message: t(c, "user_not_found") } },
        401,
      );
    }

    // Refresh token phải còn tồn tại trong DB (chưa bị logout/thu hồi) và chưa hết hạn.
    // Nếu không đối chiếu, một token đã đăng xuất vẫn refresh được suốt 7 ngày.
    const now = new Date();
    const storedTokens = await db
      .select({ id: schema.refreshTokens.id, token_hash: schema.refreshTokens.token_hash })
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.user_id, user.id),
          gt(schema.refreshTokens.expires_at, now),
        ),
      );

    let matched = false;
    for (const row of storedTokens) {
      if (await verifyPassword(row.token_hash, refreshToken)) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      return c.json(
        { success: false, error: { code: "UNAUTHORIZED", message: t(c, "token_expired") } },
        401,
      );
    }

    const userBranches = await db
      .select({ branch_id: schema.userBranches.branch_id })
      .from(schema.userBranches)
      .where(eq(schema.userBranches.user_id, user.id));

    const branchIds = userBranches.map((ub) => ub.branch_id);

    const accessToken = await signAccessToken({
      sub: user.id,
      org: user.organization_id,
      role: user.role,
      branches: branchIds,
    });

    return c.json({ success: true, data: { accessToken } });
  },
);

// POST /logout
auth.post(
  "/logout",
  zValidator("json", z.object({ refreshToken: z.string() })),
  async (c) => {
    // Delete all refresh tokens for this user (simple approach)
    try {
      const payload: any = await verifyRefreshToken(c.req.valid("json").refreshToken);
      await db
        .delete(schema.refreshTokens)
        .where(eq(schema.refreshTokens.user_id, payload.sub));
    } catch {
      // Even if token is invalid, just return success
    }

    return c.json({ success: true, data: { message: t(c, "session_closed") } });
  },
);

// GET /me
auth.get("/me", authMiddleware, async (c) => {
  const payload = c.get("user") as any;

  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      organization_id: schema.users.organization_id,
    })
    .from(schema.users)
    .where(eq(schema.users.id, payload.sub))
    .limit(1);

  if (!user) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: t(c, "user_not_found") } },
      404,
    );
  }

  const userBranches = await db
    .select({ branch_id: schema.userBranches.branch_id })
    .from(schema.userBranches)
    .where(eq(schema.userBranches.user_id, user.id));

  return c.json({
    success: true,
    data: {
      ...user,
      branches: userBranches.map((ub) => ub.branch_id),
    },
  });
});

export { auth };
