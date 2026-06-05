"use client"

import { useState } from "react"

type SwarmStep = {
  id?: string
  agent?: string
  task?: string
  output?: string
  timestamp?: string
}

type Props = { steps: SwarmStep[] }

const MAX_CHARS = 400

function StepItem({ step }: { step: SwarmStep }) {
  const [expanded, setExpanded] = useState(false)
  const output = step.output ?? ""
  const isTruncated = output.length > MAX_CHARS
  const displayedOutput = expanded ? output : output.slice(0, MAX_CHARS)

  return (
    <li className="swarm-step-item">
      <div className="swarm-step-header">
        {step.agent && <span>{step.agent}</span>}
        {step.agent && step.task && <span>·</span>}
        {step.task && <span>{step.task}</span>}
        {step.timestamp && (
          <span style={{ marginLeft: "auto" }}>
            {new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(new Date(step.timestamp))}
          </span>
        )}
      </div>
      {output && (
        <>
          <div className="swarm-step-output">
            {displayedOutput}
            {isTruncated && !expanded && "…"}
          </div>
          {isTruncated && (
            <button
              className="swarm-step-toggle"
              onClick={() => setExpanded((v) => !v)}
              type="button"
            >
              {expanded ? "Voir moins" : "Voir plus"}
            </button>
          )}
        </>
      )}
    </li>
  )
}

export default function StepsTimeline({ steps }: Props) {
  if (steps.length === 0) return null

  return (
    <ol className="swarm-steps-timeline">
      {steps.map((step, i) => (
        <StepItem key={step.id ?? i} step={step} />
      ))}
    </ol>
  )
}
