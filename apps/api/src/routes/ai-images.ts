import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppEnv } from "../types.js";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { getPublicUrl, uploadToR2 } from "../lib/r2.js";

const generateMenuImageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  categoryName: z.string().trim().max(120).optional(),
});

const aiImages = new Hono<AppEnv>();

aiImages.use("*", authMiddleware);
aiImages.use("*", tenantMiddleware);
aiImages.use("*", requireBranch);

type GeneratedImage = {
  imageBytes?: Buffer;
  imageUrl?: string;
  model: string;
  provider: "fal" | "openai";
};

function assertConfigured() {
  if (!process.env.FAL_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("Missing FAL_KEY or OPENAI_API_KEY");
  }
}

function hasR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_PUBLIC_URL,
  );
}

function buildPrompt(input: z.infer<typeof generateMenuImageSchema>) {
  const name = input.name.trim();
  const category = input.categoryName?.trim();
  const cleanedDescription = cleanMenuDescription(input.description);
  const productHint = describeVietnameseMenuItem(name, category);
  const categoryLine = input.categoryName
    ? `Menu category: ${category}.`
    : "Menu category: Vietnamese cafe drink or food item.";
  const descriptionLine = cleanedDescription
    ? `Useful product description: ${cleanedDescription}.`
    : "Ignore POS metadata such as item code, SKU, unit, and price.";

  return [
    `Create a realistic commercial menu product photo of the exact item named "${name}".`,
    productHint,
    categoryLine,
    descriptionLine,
    "The image must show the real drink or food itself, not a generic placeholder, not packaging, not a menu poster.",
    "Style: appetizing real food photography, soft natural light, clean Vietnamese cafe background, centered composition, product clearly visible, realistic glass/cup texture.",
    "Rules: no text, no item code, no logo, no watermark, no hands, no extra clutter, no real branded packaging.",
    "Square 1:1 image, suitable for POS product cards and online menu display.",
  ].join(" ");
}

function cleanMenuDescription(description?: string) {
  if (!description) return "";

  return description
    .replace(/ma\s*mon\s*:[^|.,;]+[|.,;]?/gi, "")
    .replace(/ma\s*sp\s*:[^|.,;]+[|.,;]?/gi, "")
    .replace(/sku\s*:[^|.,;]+[|.,;]?/gi, "")
    .replace(/don\s*vi\s*:[^|.,;]+[|.,;]?/gi, "")
    .replace(/unit\s*:[^|.,;]+[|.,;]?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[|.,;\s]+|[|.,;\s]+$/g, "")
    .trim();
}

function describeVietnameseMenuItem(name: string, category?: string) {
  const text = `${name} ${category || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const hints: Array<[RegExp, string]> = [
    [/bac\s*xiu/, "Depict bac xiu: a Vietnamese iced milk coffee with lots of condensed milk, pale creamy coffee color, served in a clear glass with ice."],
    [/ca\s*phe\s*sua|cafe\s*sua/, "Depict Vietnamese milk coffee: dark coffee mixed with condensed milk, visible creamy layers if iced, served in a cafe glass."],
    [/ca\s*phe\s*da|cafe\s*da/, "Depict Vietnamese iced black coffee: dark coffee over ice in a clear glass, strong and glossy."],
    [/americano/, "Depict an americano coffee, either iced or hot according to the item name, clean cafe presentation."],
    [/espresso/, "Depict a small espresso shot with crema in a demitasse cup or clear espresso glass."],
    [/matcha/, "Depict a matcha drink with natural green tea color, creamy texture, cafe glass or cup."],
    [/sua\s*chua|yogurt/, "Depict Vietnamese yogurt drink or yogurt dessert: creamy white yogurt in a clear glass, fresh and chilled, not a milk carton."],
    [/sinh\s*to|smoothie/, "Depict a thick blended smoothie in a clear glass with fresh fruit cues, chilled and creamy."],
    [/tra\s*sua|milk\s*tea/, "Depict milk tea in a clear cup or glass, creamy tea color, optional tapioca pearls only if the name suggests it."],
    [/\btra\b|tea/, "Depict a tea drink in a clear glass or cup, refreshing cafe style, matching the item name."],
    [/soda/, "Depict a colorful soda drink with bubbles and ice in a clear glass."],
    [/ca\s*cao|cacao|cocoa/, "Depict a cocoa drink with chocolate color, creamy top if suitable, served in a cafe glass or cup."],
  ];

  return (
    hints.find(([pattern]) => pattern.test(text))?.[1] ||
    "Infer the Vietnamese cafe menu item from its name and render the most likely real product faithfully."
  );
}

function decodeBase64Image(b64: string) {
  return Buffer.from(b64, "base64");
}

function openAiErrorMessage(result: any) {
  const code = result?.error?.code;
  const message = result?.error?.message || "";

  if (code === "billing_hard_limit_reached" || message.includes("Billing hard limit")) {
    return "Key OpenAI da cham gioi han billing. Vao OpenAI Platform tang han muc/nap billing hoac dung key khac.";
  }

  if (code === "insufficient_quota" || message.toLowerCase().includes("quota")) {
    return "Key OpenAI khong con quota. Kiem tra billing/quota hoac dung key khac.";
  }

  return message || "Cannot generate AI image. Check the OpenAI API key and quota.";
}

function falErrorMessage(result: any) {
  const message =
    result?.detail?.[0]?.msg ||
    result?.detail ||
    result?.error ||
    result?.message ||
    "Fal.ai khong tao duoc anh. Kiem tra FAL_KEY hoac so du.";

  if (typeof message === "string") return message;
  try {
    return JSON.stringify(message);
  } catch {
    return "Fal.ai tra loi loi khong doc duoc. Kiem tra model, key hoac so du.";
  }
}

function falPayload(model: string, prompt: string) {
  const imageSize = process.env.FAL_IMAGE_SIZE || "square_hd";
  const quality = process.env.FAL_IMAGE_QUALITY || "medium";
  const basePayload: Record<string, unknown> = {
    prompt,
    image_size: imageSize,
    num_images: 1,
    output_format: "png",
  };

  if (model.includes("gpt-image-2")) {
    return {
      ...basePayload,
      quality,
    };
  }

  return {
    ...basePayload,
    enable_safety_checker: true,
  };
}

async function generateWithFal(prompt: string): Promise<GeneratedImage> {
  const model = process.env.FAL_IMAGE_MODEL || "fal-ai/gpt-image-2";
  const controller = new AbortController();
  const timeoutMs = Number(process.env.FAL_IMAGE_TIMEOUT_MS || 180000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let result: any;

  try {
    response = await fetch(`https://fal.run/${model}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(falPayload(model, prompt)),
    });
    result = await response.json();
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(
        `Fal.ai tao anh qua lau (${Math.round(timeoutMs / 1000)}s). Thu lai hoac doi model nhanh hon.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(falErrorMessage(result));
  }

  const imageUrl = result?.images?.[0]?.url;
  if (!imageUrl) {
    throw new Error("Fal.ai did not return an image URL.");
  }

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error("Cannot download generated image from Fal.ai.");
  }
  return {
    imageBytes: Buffer.from(await imageResponse.arrayBuffer()),
    model,
    provider: "fal",
  };
}

async function generateWithOpenAi(prompt: string): Promise<GeneratedImage> {
  const model = process.env.GPT_IMAGE_MODEL || "gpt-image-1";
  const size = process.env.GPT_IMAGE_SIZE || "1024x1024";
  const quality = process.env.GPT_IMAGE_QUALITY || "medium";

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size,
      quality,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(openAiErrorMessage(result));
  }

  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI did not return a valid image.");
  }

  return {
    imageBytes: decodeBase64Image(b64),
    model,
    provider: "openai",
  };
}

async function storeImage(
  organizationId: string,
  imageBytes: Buffer,
): Promise<{ url: string; key: string; storage: "r2" | "local" }> {
  const fileName = `ai-${crypto.randomUUID()}.png`;

  if (hasR2Config()) {
    const key = `${organizationId}/menu/${fileName}`;
    await uploadToR2(key, imageBytes, "image/png");
    return { url: getPublicUrl(key), key, storage: "r2" };
  }

  const key = `ai/${fileName}`;
  const uploadDir =
    process.env.LOCAL_UPLOAD_DIR || path.join("apps", "web", "public", "uploads");
  const absolutePath = path.join(uploadDir, key);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, imageBytes);

  const publicBase = process.env.PUBLIC_UPLOAD_URL || "/uploads";
  return {
    url: `${publicBase.replace(/\/$/, "")}/${key}`,
    key,
    storage: "local",
  };
}

aiImages.post(
  "/menu-item",
  requirePermission("menu:update"),
  zValidator("json", generateMenuImageSchema),
  async (c) => {
    try {
      assertConfigured();
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: { code: "CONFIG_ERROR", message: err.message },
        },
        500,
      );
    }

    const tenant = c.get("tenant") as any;
    const body = c.req.valid("json");
    const prompt = buildPrompt(body);

    let generated: GeneratedImage;
    try {
      generated = process.env.FAL_KEY
        ? await generateWithFal(prompt)
        : await generateWithOpenAi(prompt);
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "AI_IMAGE_ERROR",
            message: err.message || "Khong tao duoc anh AI.",
          },
        },
        400,
      );
    }

    const stored = generated.imageBytes
      ? await storeImage(tenant.organizationId, generated.imageBytes)
      : {
          url: generated.imageUrl!,
          key: generated.imageUrl!,
          storage: "fal" as const,
        };

    return c.json({
      success: true,
      data: {
        url: stored.url,
        key: stored.key,
        prompt,
        model: generated.model,
        provider: generated.provider,
        storage: stored.storage,
      },
    });
  },
);

export { aiImages };
