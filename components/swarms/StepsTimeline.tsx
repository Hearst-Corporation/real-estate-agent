"use client"

import { useState } from "react"
import { UI } from "@/lib/ui-strings"

type SwarmStep = {
  id?: string
  agent?: string
  task?: string
  output?: string
  timestamp?: string
}

type Props = { steps: SwarmStep[] }

const MAX_CHARS = 400

function StepItem({ step, isLast }: { step: SwarmStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const output = step.output ?? ""
  const isTruncated = output.length > MAX_CHARS
  const displayedOutput = expanded ? output : output.slice(0, MAX_CHARS)

  return (
    <li className="relative flex gap-3 pb-4">
      {!isLast && (
        <span className="absolute top-2 left-[5px] h-full w-px bg-white/10" aria-hidden="true" />
      )}
      <span className="relative mt-1.5 size-2.5 shrink-0 rounded-full bg-indigo-400" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
          {step.agent && <span className="font-medium text-slate-200">{step.agent}</span>}
          {step.agent && step.task && <span>·</span>}
          {step.task && <span>{step.task}</span>}
          {step.timestamp && (
            <span className="ml-auto text-slate-500">
              {new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(new Date(step.timestamp))}
            </span>
          )}
        </div>
        {output && (
          <>
            <div className="mt-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-3 font-mono text-xs whitespace-pre-wrap text-slate-300">
              {displayedOutput}
              {isTruncated && !expanded && "…"}
            </div>
            {isTruncated && (
              <button
                className="mt-1.5 text-xs font-medium text-indigo-300 hover:text-indigo-200"
                onClick={() => setExpanded((v) => !v)}
                type="button"
              >
                {expanded ? UI.swarms.stepsExpandLess : UI.swarms.stepsExpandMore}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  )
}

export default function StepsTimeline({ steps }: Props) {
  if (steps.length === 0) return null

  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => (
        <StepItem key={step.id ?? i} step={step} isLast={i === steps.length - 1} />
      ))}
    </ol>
  )
}
