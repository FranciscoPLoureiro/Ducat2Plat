import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function authorize(request: NextRequest): boolean {
  const token = request.headers.get("x-revalidate-token");
  return !!token && token === process.env.REVALIDATE_TOKEN;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!authorize(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const positionId = parseInt(id, 10);
  if (isNaN(positionId)) {
    return Response.json({ error: "Invalid position ID" }, { status: 400 });
  }

  const body = await request.json();
  const db = getSupabaseAdmin();

  if (body.action === "close") {
    const closedPrice = Number(body.closed_price);
    if (isNaN(closedPrice)) {
      return Response.json({ error: "closed_price required" }, { status: 400 });
    }

    const { error } = await db
      .from("positions")
      .update({
        status: "closed",
        closed_price: closedPrice,
        closed_at: new Date().toISOString(),
      })
      .eq("id", positionId)
      .eq("status", "open");

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ closed: true });
  }

  if (body.target_price != null) {
    const { error } = await db
      .from("positions")
      .update({ target_price: Number(body.target_price) })
      .eq("id", positionId)
      .eq("status", "open");

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ updated: true });
  }

  return Response.json({ error: "No valid action" }, { status: 400 });
}
