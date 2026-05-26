import { Skeleton, SkeletonCard, SkeletonHeader } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <SkeletonHeader />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  )
}
