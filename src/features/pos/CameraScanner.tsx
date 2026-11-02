import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

// BarcodeDetector is not in TypeScript's DOM lib yet.
interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike
  }
}

export const cameraScanSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39']

/** Same code seen again within this window is ignored, so one scan adds one item. */
const REPEAT_MS = 1500

interface Props {
  onDetect: (code: string) => void
  className?: string
}

/** Live camera preview that reports barcodes via the browser's BarcodeDetector (Chrome on Android/macOS). */
export function CameraScanner({ onDetect, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onDetectRef = useRef(onDetect)
  onDetectRef.current = onDetect
  const [error, setError] = useState<string | null>(cameraScanSupported ? null : 'unsupported')

  useEffect(() => {
    if (!cameraScanSupported) return
    let stream: MediaStream | null = null
    let timer: number | undefined
    let stopped = false
    const last = { code: '', at: 0 }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        const video = videoRef.current!
        video.srcObject = stream
        await video.play()
        const detector = new window.BarcodeDetector!({ formats: FORMATS })
        const tick = async () => {
          if (stopped) return
          try {
            if (video.readyState >= 2) {
              const [hit] = await detector.detect(video)
              const now = Date.now()
              if (hit && (hit.rawValue !== last.code || now - last.at > REPEAT_MS)) {
                last.code = hit.rawValue
                last.at = now
                onDetectRef.current(hit.rawValue)
              }
            }
          } catch {
            // A single failed frame is not worth reporting.
          }
          timer = window.setTimeout(tick, 200)
        }
        void tick()
      } catch (err) {
        console.error(err)
        setError((err as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'failed')
      }
    }

    void start()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const message =
    error === 'unsupported'
      ? 'Ky shfletues nuk lexon barkode me kamerë. Përdor Chrome në Android, ose një skaner USB/Bluetooth.'
      : error === 'denied'
        ? 'Leja për kamerën u refuzua. Lejoje te cilësimet e shfletuesit.'
        : error === 'failed'
          ? 'Kamera nuk u hap.'
          : 'Drejtoje kamerën te barkodi'

  return (
    <div className={cn('relative flex h-[200px] items-center justify-center overflow-hidden rounded-card bg-[#1B2A22]', className)}>
      {!error && <video ref={videoRef} muted playsInline className="absolute inset-0 size-full object-cover" />}
      {!error && (
        <div className="relative h-[110px] w-[60%] max-w-[300px] rounded-xl border-[3px] border-[#6EE7B0]">
          <div className="absolute inset-x-0 top-1/2 h-0.5 bg-[#6EE7B0]" />
        </div>
      )}
      <p
        className={cn(
          'absolute inset-x-4 bottom-3 text-center text-[13px] text-[#B5C7BD]',
          error && 'static px-4 text-sm text-white',
        )}
      >
        {message}
      </p>
    </div>
  )
}
