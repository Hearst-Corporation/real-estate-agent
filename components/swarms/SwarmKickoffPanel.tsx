"use client"

import { useState, useEffect, useRef } from "react"
import { UI } from "@/lib/ui-strings"
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
  /**
   * Si fourni, appelé avec le run_id dès le lancement au lieu de suivre le run
   * inline. Permet au parent de rediriger vers la page run dédiée (URL stable,
   * résiliente à la navigation). Sans ce prop, le panel suit le run inline.
   */
  onLaunched?: (runId: string) => void
}

const POLL_INTERVAL_MS = 3_000
// Au montage, on reprend automatiquement le suivi du dernier run s'il est encore
// actif — ou s'il vient de se terminer (fenêtre de fraîcheur) pour réafficher le
// résultat. Au-delà, on repart en idle pour ne pas ressusciter un vieux run.
const RESUME_FRESH_MS = 10 * 60_000

type RunState =
  | { phase: 'idle' }
  | { phase: 'launching' }
  | { phase: 'running'; runId: string; status: SwarmRunStatus; steps: SwarmStep[] }
  | { phase: 'done'; output: string | undefined; steps: SwarmStep[] }
  | { phase: 'failed'; message: string; steps: SwarmStep[] }
  | { phase: 'error'; message: string }

export default function SwarmKickoffPanel({ swarmId, swarmName, onDone, onLaunched }: Props) {
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

  // Un seul poll : lit le statut live (l'API merge l'engine) et met à jour l'état.
  const pollOnce = async (runId: string) => {
    try {
      const res = await fetch(`/api/swarms/${swarmId}/runs/${runId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      type PollResponse = { run: { status: SwarmRunStatus; output?: string | null; error?: string }; steps: SwarmStep[] }
      const data: PollResponse = await res.json()
      const steps = data.steps ?? []
      const runStatus = data.run?.status
      const runOutput = data.run?.output ?? undefined

      if (runStatus === 'done') {
        stopPolling()
        setState({ phase: 'done', output: runOutput, steps })
        onDone?.(runOutput)
      } else if (runStatus === 'failed' || runStatus === 'error') {
        stopPolling()
        setState({ phase: 'failed', message: data.run?.error ?? UI.swarms.kickoffFailed, steps })
      } else {
        setState({ phase: 'running', runId, status: runStatus ?? 'pending', steps })
      }
    } catch (err) {
      stopPolling()
      setState({ phase: 'error', message: err instanceof Error ? err.message : UI.swarms.kickoffNetworkError })
    }
  }

  const startPolling = (runId: string) => {
    stopPolling()
    void pollOnce(runId) // poll immédiat — pas d'attente de POLL_INTERVAL_MS à la reprise
    intervalRef.current = setInterval(() => void pollOnce(runId), POLL_INTERVAL_MS)
  }

  // Reprise au montage : le run vit côté engine (durable), seul le suivi UI est
  // éphémère. On le restaure pour qu'un changement de page ne « coupe » plus rien.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/swarms/${swarmId}/runs`)
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          items?: Array<{ run_id: string; status: SwarmRunStatus; created_at?: string }>
        }
        const latest = data.items?.[0]
        if (!latest || cancelled) return
        const active = latest.status === 'pending' || latest.status === 'running'
        const fresh = latest.created_at
          ? Date.now() - new Date(latest.created_at).getTime() < RESUME_FRESH_MS
          : false
        if (active || fresh) {
          setState({ phase: 'running', runId: latest.run_id, status: active ? latest.status : 'running', steps: [] })
          startPolling(latest.run_id)
        }
      } catch {
        // pas de reprise possible → on reste en idle
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swarmId])

  const handleLaunch = async () => {
    setState({ phase: 'launching' })
    try {
      const res = await fetch(`/api/swarms/${swarmId}/kickoff`, { method: "POST" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { runId: string } = await res.json()
      // Si le parent gère le suivi (page run dédiée, URL stable), on lui délègue.
      if (onLaunched) {
        onLaunched(data.runId)
        return
      }
      setState({ phase: 'running', runId: data.runId, status: 'pending', steps: [] })
      startPolling(data.runId)
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : UI.swarms.kickoffLaunchError })
    }
  }

  const isRunning = state.phase === 'running' && (state.status === 'pending' || state.status === 'running')

  return (
    <div className="flex flex-col gap-3">
      {(state.phase === 'idle' || state.phase === 'error') && (
        <>
          <button
            className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
            onClick={handleLaunch}
            type="button"
          >
            {UI.swarms.kickoffLaunch(swarmName)}
          </button>
          {state.phase === 'error' && (
            <p className="text-sm text-red-400">{state.message}</p>
          )}
        </>
      )}

      {state.phase === 'launching' && (
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span className="size-3.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" aria-hidden="true" />
          <span>{UI.swarms.kickoffLaunching}</span>
        </div>
      )}

      {state.phase === 'running' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {isRunning && (
              <span className="size-3.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" aria-hidden="true" />
            )}
            <RunStatusBadge status={state.status} />
          </div>
          {state.steps.length > 0 && <StepsTimeline steps={state.steps} />}
        </div>
      )}

      {state.phase === 'done' && (
        <div className="flex flex-col gap-3">
          <RunStatusBadge status="done" />
          {state.output && (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm whitespace-pre-wrap text-slate-300">
              {state.output}
            </div>
          )}
          {state.steps.length > 0 && <StepsTimeline steps={state.steps} />}
        </div>
      )}

      {state.phase === 'failed' && (
        <div className="flex flex-col gap-3">
          <RunStatusBadge status="failed" />
          <p className="text-sm text-red-400">{state.message}</p>
          {state.steps.length > 0 && <StepsTimeline steps={state.steps} />}
          <button
            className="inline-flex w-fit items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
            onClick={() => setState({ phase: 'idle' })}
            type="button"
          >
            {UI.swarms.kickoffRetry}
          </button>
        </div>
      )}
    </div>
  )
}
