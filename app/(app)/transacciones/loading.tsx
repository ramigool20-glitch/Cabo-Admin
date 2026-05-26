import { Skeleton, SkeletonRow, SkeletonHeader } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="px-4 pt-5 pb-24 space-y-4 max-w-3xl mx-auto">
      <SkeletonHeader />
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
      </div>
    </div>
  )
}
