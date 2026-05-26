import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] px-4 pt-5 max-w-3xl mx-auto w-full">
      <div className="flex-1 space-y-3">
        <Skeleton className="h-16 w-3/4 rounded-2xl" />
        <Skeleton className="h-20 w-2/3 rounded-2xl ml-auto" />
        <Skeleton className="h-12 w-1/2 rounded-2xl" />
        <Skeleton className="h-28 w-3/4 rounded-2xl" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl mb-4" />
    </div>
  )
}
