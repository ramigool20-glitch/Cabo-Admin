import { Skeleton, SkeletonRow, SkeletonHeader } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <SkeletonHeader />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
      </div>
    </div>
  )
}
