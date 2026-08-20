import { redirect } from "next/navigation";

export default function MyAgentsRedirectPage() {
  redirect("/agents/library");
}
