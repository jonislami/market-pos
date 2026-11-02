import { useSyncExternalStore } from 'react'
import { getDeviceSettings, updateDeviceSettings } from './deviceSettings'

/** GATT services used by common thermal printers (generic 18F0, ISSC, Xprinter/Goojprt, etc.). */
const PRINTER_SERVICES: BluetoothServiceUUID[] = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
]

const NAME_PREFIXES = ['Printer', 'BlueTooth Printer', 'MPT', 'MTP', 'PT-', 'RPP', 'XP-', 'POS', 'Inner', 'GP-', 'P58', 'P80']

export type PrinterStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected'

interface PrinterState {
  status: PrinterStatus
  deviceName: string | null
  error: string | null
}

export const bluetoothSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator

let state: PrinterState = {
  status: bluetoothSupported ? 'disconnected' : 'unsupported',
  deviceName: getDeviceSettings().lastDeviceName,
  error: null,
}
const listeners = new Set<() => void>()
let device: BluetoothDevice | null = null
let characteristic: BluetoothRemoteGATTCharacteristic | null = null

function setState(patch: Partial<PrinterState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function usePrinterState(): PrinterState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

function onDisconnected() {
  characteristic = null
  setState({ status: 'disconnected' })
}

/** Finds the first characteristic that accepts writes on any printer service. */
async function findWritable(server: BluetoothRemoteGATTServer): Promise<BluetoothRemoteGATTCharacteristic> {
  const services = await server.getPrimaryServices()
  for (const service of services) {
    try {
      for (const c of await service.getCharacteristics()) {
        if (c.properties.write || c.properties.writeWithoutResponse) return c
      }
    } catch {
      // Some services refuse enumeration; try the next one.
    }
  }
  throw new Error('Printeri nuk ka kanal për shkrim. Provo një printer tjetër ose rinise.')
}

async function attach(d: BluetoothDevice) {
  setState({ status: 'connecting', error: null, deviceName: d.name ?? 'Printer' })
  d.removeEventListener('gattserverdisconnected', onDisconnected)
  d.addEventListener('gattserverdisconnected', onDisconnected)
  const server = await d.gatt!.connect()
  characteristic = await findWritable(server)
  device = d
  updateDeviceSettings({ lastDeviceId: d.id, lastDeviceName: d.name ?? 'Printer' })
  setState({ status: 'connected', deviceName: d.name ?? 'Printer' })
}

function friendlyError(err: unknown): string {
  const e = err as DOMException
  if (e?.name === 'NotFoundError') return 'Nuk u zgjodh asnjë printer.'
  if (e?.name === 'SecurityError') return 'Shfletuesi e bllokoi Bluetooth-in. Hape aplikacionin përmes https ose localhost.'
  if (e?.name === 'NetworkError') return 'Printeri nuk u lidh. Sigurohu që është ndezur dhe afër.'
  return e?.message || 'Lidhja me printerin dështoi.'
}

/** Opens the browser's device chooser. `showAll` lists every device, for printers that hide their services. */
export async function connectPrinter(showAll = false): Promise<void> {
  if (!bluetoothSupported) throw new Error('Ky shfletues nuk mbështet Bluetooth.')
  try {
    const d = await navigator.bluetooth.requestDevice(
      showAll
        ? { acceptAllDevices: true, optionalServices: PRINTER_SERVICES }
        : {
            filters: [...PRINTER_SERVICES.map((s) => ({ services: [s] })), ...NAME_PREFIXES.map((namePrefix) => ({ namePrefix }))],
            optionalServices: PRINTER_SERVICES,
          },
    )
    await attach(d)
  } catch (err) {
    const message = friendlyError(err)
    setState({ status: 'disconnected', error: (err as DOMException)?.name === 'NotFoundError' ? null : message })
    throw new Error(message)
  }
}

/** Reconnects to the last printer without the chooser, where the browser allows it (getDevices). */
export async function reconnectPrinter(): Promise<boolean> {
  if (characteristic && device?.gatt?.connected) return true
  if (device) {
    try {
      await attach(device)
      return true
    } catch {
      // fall through to getDevices
    }
  }
  const { lastDeviceId } = getDeviceSettings()
  if (!bluetoothSupported || !lastDeviceId || !navigator.bluetooth.getDevices) return false
  try {
    const known = (await navigator.bluetooth.getDevices()).find((d) => d.id === lastDeviceId)
    if (!known) return false
    await attach(known)
    return true
  } catch (err) {
    setState({ status: 'disconnected', error: friendlyError(err) })
    return false
  }
}

export function disconnectPrinter() {
  device?.gatt?.disconnect()
  device = null
  characteristic = null
  updateDeviceSettings({ lastDeviceId: null, lastDeviceName: null })
  setState({ status: 'disconnected', deviceName: null, error: null })
}

/** Sends bytes in chunks; small chunks and a short pause keep cheap printers from dropping data. */
export async function writeToPrinter(data: Uint8Array): Promise<void> {
  if (!(await reconnectPrinter()) || !characteristic) throw new Error('Printeri nuk është i lidhur.')
  const size = Math.min(Math.max(getDeviceSettings().chunkSize, 20), 512)
  const c = characteristic
  for (let i = 0; i < data.length; i += size) {
    const chunk = data.slice(i, i + size)
    if (c.properties.writeWithoutResponse) {
      await c.writeValueWithoutResponse(chunk)
      await new Promise((r) => setTimeout(r, 20))
    } else {
      await c.writeValueWithResponse(chunk)
    }
  }
}

/** Try to reconnect quietly at startup so the first receipt prints without a click. */
export function autoReconnect() {
  if (bluetoothSupported && getDeviceSettings().lastDeviceId) void reconnectPrinter()
}
