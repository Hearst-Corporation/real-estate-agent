"use client"

import { useState, useEffect, useRef } from "react"
import RunStatusBadge from "./RunStatusBadge"
import StepsTimeline from "./StepsTimeline"

type SwarmRunStatus = 'pending' | 'running' | 'done' | 'failed' | 'error'

type SwarmStep = {
  id?: string
  agent?: string
  task?: string
  output?: string
  timestamp?: string
}

type Props = {
  swarmId: string
  swarmName: string
  onDone?: (output: string | undefined) => void
}

type RunState =
  | { phase: 'idle' }
  | { phase: 'launching' }
  | { phase: 'running'; runId: string; status: SwarmRunStatus; steps: SwarmStep[] }
  | { phase: 'done'; output: string | undefined; steps: SwarmStep[] }
  | { phase: 'failed'; message: string; steps: SwarmStep[] }
  | { phase: 'error'; message: string }

export default function SwarmKickoffPanel({ swarmId, swarmName, onDone }: Props) {
  const [state, setState] = useState<RunState>({ phase: 'idle' })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [])

  const startPolling = (runId: string) => {
    stopPolling()
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/swarms/${swarmId}/runs/${runId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: { status: SwarmRunStatus; steps?: SwarmStep[]; output?: string; error?: string } = await res.json()
        const steps = data.steps ?? []

        if (data.status === 'done') {
          stopPolling()
          setState({ phase: 'done', output: data.output, steps })
          onDone?.(data.output)
        } else if (data.status === 'failed' || data.status === 'error') {
          stopPolling()
          setState({ phase: 'failed', message: data.error ?? "Le swarm a échoué.", steps })
        } else {
          setState({ phase: 'running', runId, status: data.status, steps })
        }
      } catch (err) {
        stopPolling()
        setState({ phase: 'error', message: err instanceof Error ? err.message : "Erreur réseau." })
      }
    }, 3000)
  }

  const handleLaunch = async () => {
    setState({ phase: 'launching' })
    try {
      const res = await fetch(`/api/swarms/${swarmId}/kickoff`, { method: "POST" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { runId: string } = await res.json()
      setState({ phase: 'running', runId: data.runId, status: 'pending', steps: [] })
      startPolling(data.runId)
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : "Erreur lors du lancement." })
    }
  }

  const isRunning = state.phase === 'running' && (state.status === 'pending' || state.status === 'running')

  return (
    <div className="swarm-kickoff-panel">
      {(state.phase === 'idle' || state.phase === 'error') && (
        <>
          <button
            className="ct-btn ct-btn-primary"
            onClick={handleLaunch}
            disabled={false}
            type="button"
          >
            Lancer le swarm {swarmName}
          </button>
          {state.phase === 'error' && (
            <p className="crm-form-error" style={{ color: 'var(--ct-text-danger)', fontSize: 12 }}>
              {state.message}
            </p>
          )}
        </>
      )}

      {state.phase === 'launching' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="swarm-spinner" />
          <span style={{ fontSize: 13, color: 'var(--ct-text-muted)' }}>Lancement en cours…</span>
        </div>
      )}

      {state.phase === 'running' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ct-space-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isRunning && <span className="swarm-spinner" />}
            <RunStatusBadge status={state.status} />
          </div>
          {state.steps.length > 0 && <StepsTimeline steps={state.steps} />}
        </div>
      )}

      {state.phase === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ct-space-sm)' }}>
          <RunStatusBadge status="done" />
          {state.output && (
            <div className="swarm-kickoff-output">{state.output}</div>
          )}
          {state.steps.length > 0 && <StepsTimeline steps={state.steps} />}
        </div>
      )}

      {state.phase === 'failed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ct-space-sm)' }}>
          <RunStatusBadge status="failed" />
          <p style={{ fontSize: 12, color: 'var(--ct-text-danger)', margin: 0 }}>{state.message}</p>
          {state.steps.length > 0 && <StepsTimeline steps={state.steps} />}
          <button
            className="ct-btn ct-btn-secondary"
            onClick={() => setState({ phase: 'idle' })}
            type="button"
          >
            Réessayer
          </button>
        </div>
      )}
    </div>
  )
}
