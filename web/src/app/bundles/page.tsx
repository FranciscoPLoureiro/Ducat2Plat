import { redirect } from "next/navigation";

// Bundles is now the landing page. Keep the old URL working.
export default function BundlesRedirect() {
  redirect("/");
}
