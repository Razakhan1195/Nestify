import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}
