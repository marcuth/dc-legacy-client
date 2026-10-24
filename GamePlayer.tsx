import { useEffect, useRef, useState } from "react"
import type { FC } from "react"
import { toast } from "sonner"

import { Skeleton } from "@/components/ui/skeleton"
import { Typography } from "@/components/ui/typography"
import { GameStore } from "@/game/core/gameStore"
import { GameEngine } from "@/game/engine/GameEngine"
import { api } from "@/lib/api"
import type { Bootstrap } from "@/lib/api"

type GamePlayerProps = { onSaved: () => void }

type Status = { kind: "loading"; message?: string } | { kind: "ready" } | { kind: "error"; message: string }

export const GamePlayer: FC<GamePlayerProps> = ({ onSaved }) => {
  const container = useRef<HTMLDivElement>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const [store] = useState(() => new GameStore())
  const [status, setStatus] = useState<Status>({ kind: "loading", message: "Loading the game..." })

  useEffect(() => {
    let cancelled = false
    let engine: GameEngine | null = null

    const start = async () => {
      try {
        setStatus({ kind: "loading", message: "Initializing PixiJS engine..." })
        const bootstrap = await api.get<Bootstrap>("/api/game/bootstrap")
        if (cancelled || !container.current) return

        // Clear container DOM before mounting
        container.current.replaceChildren()

        engine = new GameEngine()
        engineRef.current = engine
        await engine.mount(container.current, {
          playerId: bootstrap.playerId,
          playerName: bootstrap.playerName,
          loader: bootstrap.loader,
          servicesPath: bootstrap.servicesPath,
          flashVars: bootstrap.flashVars,
          legacyHosts: bootstrap.legacyHosts,
          origin: window.location.origin,
          store,
          onUiAction: () => toast.info("This part of the game is not available yet."),
          onStatusChange: (kind, message) => {
            if (!cancelled) {
              if (kind === "ready") setStatus({ kind: "ready" })
              else if (kind === "loading") setStatus({ kind: "loading", message })
              else if (kind === "error") setStatus({ kind: "error", message: message || "Engine error" })
            }
          },
        })
      } catch (error) {
        if (!cancelled) {
          setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not start the game." })
        }
      }
    }

    void start()

    const targetContainer = container.current

    return () => {
      cancelled = true
      engine?.unmount()
      engineRef.current = null
      if (targetContainer) {
        targetContainer.replaceChildren()
      }
    }
  }, [store])

  // The server announces every saved packet; the header shows a short "Saved" hint.
  useEffect(() => {
    const events = new EventSource("/stream")
    events.onmessage = (event) => {
      if (event.data !== "GAME_SAVED") return
      onSaved()
      void engineRef.current?.refresh?.()
    }
    return () => events.close()
  }, [onSaved])

  return (
    <div className="relative h-full w-full bg-black overflow-hidden select-none">
      <div ref={container} className="h-full w-full" />

      {status.kind === "loading" ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
          <Skeleton className="h-6 w-48" />
          <Typography.Muted>{status.message || "Loading the game..."}</Typography.Muted>
        </div>
      ) : null}

      {status.kind === "error" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 text-center bg-black/80">
          <div className="max-w-md space-y-3">
            <Typography.P className="text-destructive font-medium">{status.message}</Typography.P>
          </div>
        </div>
      ) : null}
    </div>
  )
}
