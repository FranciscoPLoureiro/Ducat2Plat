import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function authorize(request: NextRequest): boolean {
  const token = request.headers.get("x-revalidate-token");
  return !!token && token === process.env.REVALIDATE_TOKEN;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const status = request.nextUrl.searchParams.get("status") ?? "open";

  const { data, error } = await db
    .from("positions")
    .select(`
      id, item_id, qty, cost_ducats, cost_credits,
      junk_rate_at_buy, baseline_at_buy, target_price,
      acquired_at, status, closed_price, closed_at,
      last_alert_condition, last_alert_at,
      prime_items!inner(item_name, url_name, is_primed_mod)
    `)
    .eq("status", status)
    .order("acquired_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ positions: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { item_id, qty, cost_ducats, cost_credits, junk_rate_at_buy, baseline_at_buy, target_price } = body;

  if (!item_id || !qty || cost_ducats == null || junk_rate_at_buy == null || baseline_at_buy == null || target_price == null) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("positions")
    .insert({
      item_id,
      qty: Number(qty),
      cost_ducats: Number(cost_ducats),
      cost_credits: Number(cost_credits ?? 0),
      junk_rate_at_buy: Number(junk_rate_at_buy),
      baseline_at_buy: Number(baseline_at_buy),
      target_price: Number(target_price),
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/positions");
  return Response.json({ id: data?.id }, { status: 201 });
}
