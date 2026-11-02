import { useEffect, useRef, useState } from 'react'

export function useAnimatedNumber(target: number, durationMs = 1300): number {
  const [value, setValue] = useState(target)
  const frameRef = useRef(0)
  const currentRef = useRef(target)

  useEffect(() => {
    const start = currentRef.current
    const delta = target - start
    if (Math.abs(delta) < 0.001) return

    const startTime = performance.now()

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs)
      const eased = 1 - (1 - t) ** 3
      const next = start + delta * eased
      currentRef.current = next
      setValue(next)
      if (t < 1) frameRef.current = requestAnimationFrame(tick)
    }

    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frameRef.current)
  }, [target, durationMs])

  return value
}
