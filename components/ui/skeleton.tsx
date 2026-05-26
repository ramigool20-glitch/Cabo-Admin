import { cn } from '@/lib/utils'

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('skeleton rounded-md', className)} style={style} />
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('card p-3 space-y-2', className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-3 w-1/4" />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="card p-3 flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-5 w-16" />
    </div>
  )
}

export function SkeletonHeader() {
  return (
    <header className="space-y-2">
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-3 w-3/4" />
    </header>
  )
}
