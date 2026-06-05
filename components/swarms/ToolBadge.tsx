"use client"

type Props = { toolId: string; toolName?: string }

export default function ToolBadge({ toolId, toolName }: Props) {
  return (
    <span className="swarm-tool-badge">{toolName ?? toolId}</span>
  )
}
