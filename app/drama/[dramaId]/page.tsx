import { DramaWatch } from "@/components/DramaWatch";

export default async function DramaPage({
  params,
}: {
  params: Promise<{ dramaId: string }>;
}) {
  const { dramaId } = await params;
  return <DramaWatch dramaId={dramaId} />;
}
