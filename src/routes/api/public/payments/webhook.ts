import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { verifyWebhook, EventName, type PaddleEnv } from "@/lib/paddle.server";
import { isUuid } from "@/lib/validation";
import type { Database } from "@/integrations/supabase/types";

const ALLOWED_PRICE_IDS = new Set(["pro_monthly", "business_monthly"]);

/** Forme minimale des données de souscription reçues de Paddle. */
type PaddleSubscriptionEvent = {
  id?: unknown;
  customerId?: unknown;
  status?: unknown;
  items?: Array<{
    price?: { id?: unknown; importMeta?: { externalId?: unknown } };
    product?: { id?: unknown; importMeta?: { externalId?: unknown } };
  }>;
  currentBillingPeriod?: { startsAt?: string; endsAt?: string };
  customData?: { userId?: unknown };
  scheduledChange?: { action?: string };
};

type SubscriptionUpdate = Database["public"]["Tables"]["subscriptions"]["Update"];

/** Événement vérifié : on ne conserve que ce qui est utile. */
type VerifiedEvent = { eventType: string; data: unknown };

let _supabase: ReturnType<typeof createClient<Database>> | null = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    _supabase = createClient<Database>(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _supabase;
}

async function handleSubscriptionCreated(data: PaddleSubscriptionEvent, env: PaddleEnv) {
  const { id, customerId, items, status, currentBillingPeriod, customData } = data;

  const userId = customData?.userId;
  if (!isUuid(userId)) {
    console.error("Webhook: invalid or missing userId in customData");
    return;
  }

  if (typeof id !== "string") {
    console.error("Webhook: invalid subscription id");
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    console.error("Webhook: missing items in subscription");
    return;
  }

  const item = items[0];
  const priceId = item?.price?.importMeta?.externalId;
  const productId = item?.product?.importMeta?.externalId;

  if (typeof priceId !== "string" || typeof productId !== "string") {
    console.warn("Skipping subscription: missing importMeta.externalId", {
      rawPriceId: item?.price?.id,
      rawProductId: item?.product?.id,
    });
    return;
  }

  if (!ALLOWED_PRICE_IDS.has(priceId)) {
    console.error("Webhook: priceId not allowed", { priceId });
    return;
  }

  // Une souscription Paddle porte toujours un identifiant client
  if (typeof customerId !== "string") {
    console.error("Webhook: invalid customer id");
    return;
  }

  const supabase = getSupabase();

  // Idempotency: if subscription already exists, only update if needed
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, user_id")
    .eq("paddle_subscription_id", id)
    .maybeSingle();

  if (existing && existing.user_id !== userId) {
    console.error("Webhook: subscription exists for different user", {
      paddle_subscription_id: id,
    });
    return;
  }

  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      paddle_subscription_id: id,
      paddle_customer_id: customerId,
      product_id: productId,
      price_id: priceId,
      status: typeof status === "string" ? status : "active",
      current_period_start: currentBillingPeriod?.startsAt ?? null,
      current_period_end: currentBillingPeriod?.endsAt ?? null,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "paddle_subscription_id" },
  );
}

async function handleSubscriptionUpdated(data: PaddleSubscriptionEvent, env: PaddleEnv) {
  const { id, status, currentBillingPeriod, scheduledChange } = data;

  if (typeof id !== "string") {
    console.error("Webhook: invalid subscription id");
    return;
  }

  const supabase = getSupabase();
  const update: SubscriptionUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (typeof status === "string") {
    update["status"] = status;
  }
  if (currentBillingPeriod?.startsAt) {
    update["current_period_start"] = currentBillingPeriod.startsAt;
  }
  if (currentBillingPeriod?.endsAt) {
    update["current_period_end"] = currentBillingPeriod.endsAt;
  }
  if (scheduledChange?.action === "cancel") {
    update["cancel_at_period_end"] = true;
  } else if (scheduledChange?.action === "resume") {
    update["cancel_at_period_end"] = false;
  }

  await supabase
    .from("subscriptions")
    .update(update)
    .eq("paddle_subscription_id", id)
    .eq("environment", env);
}

async function handleSubscriptionCanceled(data: PaddleSubscriptionEvent, env: PaddleEnv) {
  if (typeof data?.id !== "string") {
    console.error("Webhook: invalid subscription id on cancel");
    return;
  }

  const supabase = getSupabase();
  await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    })
    .eq("paddle_subscription_id", data.id)
    .eq("environment", env);
}

async function tryVerifyWebhook(req: Request): Promise<{ event: VerifiedEvent; env: PaddleEnv }> {
  const body = await req.clone().text();
  const signature = req.headers.get("paddle-signature");

  if (!signature || !body) {
    throw new Error("Missing signature or body");
  }

  const errors: unknown[] = [];
  const attempts: PaddleEnv[] = ["sandbox", "live"];

  for (const env of attempts) {
    try {
      const event = await verifyWebhook(req, env);
      return { event, env };
    } catch (e) {
      errors.push(e);
    }
  }

  throw errors[0] ?? new Error("Webhook verification failed");
}

async function handleWebhook(req: Request) {
  const { event, env } = await tryVerifyWebhook(req);
  const data = event.data as PaddleSubscriptionEvent;

  switch (event.eventType) {
    case EventName.SubscriptionCreated:
      await handleSubscriptionCreated(data, env);
      break;
    case EventName.SubscriptionUpdated:
      await handleSubscriptionUpdated(data, env);
      break;
    case EventName.SubscriptionCanceled:
      await handleSubscriptionCanceled(data, env);
      break;
    case EventName.SubscriptionPastDue:
      await handleSubscriptionUpdated(data, env);
      break;
    case EventName.SubscriptionPaused:
      await handleSubscriptionUpdated(data, env);
      break;
    case EventName.SubscriptionResumed:
      await handleSubscriptionUpdated(data, env);
      break;
    default:
      // Ignore unknown events silently
      break;
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Reconstruct request to be safe if body was consumed
          const cloned = request.clone();
          await handleWebhook(cloned);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
