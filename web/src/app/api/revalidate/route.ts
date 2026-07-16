import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-revalidate-token");
  if (!token || token !== process.env.REVALIDATE_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidatePath("/");
  revalidatePath("/bundles");
  revalidatePath("/baro");

  return Response.json({ revalidated: true });
}
