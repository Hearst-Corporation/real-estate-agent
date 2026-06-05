"use client"

import Link from "next/link"
import RunStatusBadge from "./RunStatusBadge"

type Status = 'pending' | 'running' | 'done' | 'failed' | 'error'

type Props = {
  id: string
  name: string
  description?: string
  isActive: boolean
  agentCount: number
  taskCount: number
  lastRunStatus?: Status
  lastRunAt?: string
}

export default function SwarmCard({
  id,
  name,
  description,
  isActive,
  agentCount,
  taskCount,
  lastRunStatus,
  lastRunAt,
}: Props) {
  const formattedDate = lastRunAt
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(lastRunAt))
    : null

  return (
    <Link href={`/swarms/${id}`} className="crm-card swarm-card">
      <div className="crm-card-header">
        <span className="crm-card-title">{name}</span>
        <span className={`swarm-status-badge ${isActive ? 'swarm-status-done' : 'swarm-status-failed'}`}>
          {isActive ? "Actif" : "Inactif"}
        </span>
      </div>
      {description && (
        <p className="crm-card-desc">{description}</p>
      )}
      <div className="crm-card-meta">
        {agentCount} agent(s) · {taskCount} tâche(s)
      </div>
      {(lastRunStatus || formattedDate) && (
        <div className="crm-card-footer">
          {lastRunStatus && <RunStatusBadge status={lastRunStatus} size="sm" />}
          {formattedDate && (
            <span className="crm-list-meta">{formattedDate}</span>
          )}
        </div>
      )}
    </Link>
  )
}
