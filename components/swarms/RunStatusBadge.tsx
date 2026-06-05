"use client"

type Status = 'pending' | 'running' | 'done' | 'failed' | 'error'
type Props = { status: Status; size?: 'sm' | 'md' }

const LABELS: Record<Status, string> = {
  pending: "En attente",
  running: "En cours...",
  done: "Terminé",
  failed: "Échoué",
  error: "Erreur",
}

export default function RunStatusBadge({ status, size = 'md' }: Props) {
  return (
    <span
      className={`swarm-status-badge swarm-status-${status}${size === 'sm' ? ' swarm-status-badge-sm' : ''}`}
    >
      {LABELS[status]}
    </span>
  )
}
