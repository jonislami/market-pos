import { useSyncExternalStore } from 'react'

export type Charset = 'cp852' | 'cp1250' | 'ascii'

/** Per-device settings: they depend on the printer/register at this till, not on the store. */
export interface DeviceSettings {
  registerId: number
  charset: Charset
  /** Bytes per Bluetooth write; some printers only accept 20–180. */
  chunkSize: number
  lastDeviceId: string | null
  lastDeviceName: string | null
}

const KEY = 'market-pos.device-settings'

const defaults: DeviceSettings = {
  registerId: 1,
  charset: 'cp852',
  chunkSize: 100,
  lastDeviceId: null,
  lastDeviceName: null,
}

function read(): DeviceSettings {
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DeviceSettings>) }
  } catch {
    return defaults
  }
}

let current = read()
const listeners = new Set<() => void>()

export function getDeviceSettings(): DeviceSettings {
  return current
}

export function updateDeviceSettings(patch: Partial<DeviceSettings>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Not critical.
  }
  listeners.forEach((l) => l())
}

export function useDeviceSettings(): DeviceSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}

export const CHARSET_OPTIONS: { value: Charset; label: string }[] = [
  { value: 'cp852', label: 'CP852 (ë, ç – shumica e printerëve)' },
  { value: 'cp1250', label: 'CP1250 / Windows-1250' },
  { value: 'ascii', label: 'Pa shkronja shqipe (ë→e, ç→c)' },
]
