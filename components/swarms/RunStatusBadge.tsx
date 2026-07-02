"use client"

import { UI } from "@/lib/ui-strings"

type Status = 'pending' | 'running' | 'done' | 'failed' | 'error' | 'paused_hitl'
type Props = { status: Status; size?: 'sm' | 'md' }

const STATUS_TONE: Record<Status, string> = {
  pending: "border-slate-400/30 bg-slate-400/10 text-slate-300",
  running: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300",
  done: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  failed: "border-red-400/30 bg-red-400/10 text-red-300",
  error: "border-red-400/30 bg-red-400/10 text-red-300",
  paused_hitl: "border-amber-400/30 bg-amber-400/10 text-amber-300",
}

export default function RunStatusBadge({ status, size = 'md' }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      } ${STATUS_TONE[status]}`}
    >
      {UI.swarms.runStatus[status]}
    </span>
  )
}
