import { BrowserSetup } from "@/components/browser/browser-setup";
export default async function BrowserPage({
  searchParams,
}: {
  searchParams: Promise<{
    installation?: string;
    thread?: string;
    origin?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <BrowserSetup
      installation={params.installation ?? ""}
      thread={params.thread ?? ""}
      origin={params.origin ?? ""}
    />
  );
}
