"use client"

import { UI } from "@/lib/ui-strings"

type Status = 'pending' | 'running' | 'done' | 'failed' | 'error'
type Props = { status: Status; size?: 'sm' | 'md' }

export default function RunStatusBadge({ status, size = 'md' }: Props) {
  return (
    <span
      className={`swarm-status-badge swarm-status-${status}${size === 'sm' ? ' swarm-status-badge-sm' : ''}`}
    >
      {UI.swarms.runStatus[status]}
    </span>
  )
}
