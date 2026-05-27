import Link from 'next/link'
import { cn } from '@/lib/utils'

export function EmptyState({
  emoji,
  title,
  description,
  hint,
  cta,
  className,
}: {
  emoji?: string
  title: string
  description?: string
  hint?: React.ReactNode
  cta?: { label: string; href: string }
  className?: string
}) {
  return (
    <div className={cn(
      'card border-dashed p-8 text-center space-y-2',
      className,
    )}>
      {emoji && <div className="text-4xl">{emoji}</div>}
      <p className="text-sm font-bold text-zinc-200">{title}</p>
      {description && (
        <p className="text-xs text-zinc-500 max-w-sm mx-auto">{description}</p>
      )}
      {hint && <div className="text-[11px] text-zinc-500 max-w-sm mx-auto pt-1">{hint}</div>}
      {cta && (
        <Link href={cta.href} className="btn-primary inline-flex h-9 px-4 mt-2 text-xs">
          {cta.label}
        </Link>
      )}
    </div>
  )
}
