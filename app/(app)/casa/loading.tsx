import { Skeleton, SkeletonRow, SkeletonHeader, SkeletonCard } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <SkeletonHeader />
      <Skeleton className="h-32 rounded-2xl" />
      <div className="grid grid-cols-2 gap-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
      </div>
    </div>
  )
}
