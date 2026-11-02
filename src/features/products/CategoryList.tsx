import { useState, type FormEvent } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import type { Category } from '@/types/database'
import { useCreateCategory, useDeleteCategory, useRenameCategory } from './api'
import type { CategoryFilter } from './filters'

export interface CategoryCounts {
  all: number
  none: number
  byId: Map<number, number>
}

interface Props {
  categories: Category[]
  counts: CategoryCounts
  value: CategoryFilter
  onChange: (value: CategoryFilter) => void
}

const rowClass = (active: boolean) =>
  cn(
    'flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm',
    active ? 'bg-brand-100 font-semibold text-[#0F2A1F]' : 'text-ink hover:bg-[#F0F3F1]',
  )

const iconBtn = 'flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-white hover:text-ink'

function NameForm({
  initial,
  onSubmit,
  onCancel,
  pending,
}: {
  initial: string
  onSubmit: (name: string) => void
  onCancel: () => void
  pending: boolean
}) {
  const [name, setName] = useState(initial)
  function submit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) onSubmit(name.trim())
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        placeholder="Emri i kategorisë"
        className="min-h-10 min-w-0 flex-1 rounded-lg border border-field px-2.5 text-sm focus:border-brand-600 focus:outline-none"
      />
      <button type="submit" disabled={pending} aria-label="Ruaj" className={iconBtn}>
        <Check className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={onCancel} aria-label="Anulo" className={iconBtn}>
        <X className="size-4" aria-hidden />
      </button>
    </form>
  )
}

/** Desktop category sidebar with inline create / rename / delete. */
export function CategoryList({ categories, counts, value, onChange }: Props) {
  const create = useCreateCategory()
  const rename = useRenameCategory()
  const remove = useDeleteCategory()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onError = (err: unknown) => setError(errorMessage(err))

  function confirmDelete(c: Category) {
    const n = counts.byId.get(c.id) ?? 0
    const msg = n
      ? `Fshi kategorinë "${c.name}"? ${n} produkte do të mbeten pa kategori.`
      : `Fshi kategorinë "${c.name}"?`
    if (!window.confirm(msg)) return
    remove.mutate(c.id, {
      onSuccess: () => {
        setEditingId(null)
        if (value === c.id) onChange('all')
      },
      onError,
    })
  }

  return (
    <aside
      aria-label="Kategoritë"
      className="hidden w-[200px] shrink-0 flex-col gap-0.5 rounded-card border border-line bg-white p-3 lg:flex"
    >
      <span className="px-3 pb-2 pt-1.5 text-xs font-semibold uppercase text-muted">Kategoritë</span>

      <button type="button" className={rowClass(value === 'all')} onClick={() => onChange('all')}>
        <span>Të gjitha</span>
        <span className="text-xs font-normal text-muted">{counts.all}</span>
      </button>

      {categories.map((c) =>
        editingId === c.id ? (
          <div key={c.id} className="flex flex-col gap-1 py-1">
            <NameForm
              initial={c.name}
              pending={rename.isPending}
              onCancel={() => setEditingId(null)}
              onSubmit={(name) =>
                rename.mutate({ id: c.id, name }, { onSuccess: () => setEditingId(null), onError })
              }
            />
            <button
              type="button"
              onClick={() => confirmDelete(c)}
              className="flex min-h-8 items-center gap-1.5 self-start rounded-md px-2 text-xs font-semibold text-warn-700 hover:bg-warn-100"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Fshi kategorinë
            </button>
          </div>
        ) : (
          <div key={c.id} className="group/row relative">
            <button type="button" className={rowClass(value === c.id)} onClick={() => onChange(c.id)}>
              <span className="truncate">{c.name}</span>
              <span className="text-xs font-normal text-muted group-hover/row:invisible">{counts.byId.get(c.id) ?? 0}</span>
            </button>
            <button
              type="button"
              aria-label={`Ndrysho ${c.name}`}
              onClick={() => {
                setError(null)
                setEditingId(c.id)
              }}
              className={cn(iconBtn, 'absolute right-1 top-1 opacity-0 focus:opacity-100 group-hover/row:opacity-100')}
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
          </div>
        ),
      )}

      {counts.none > 0 && (
        <button type="button" className={rowClass(value === 'none')} onClick={() => onChange('none')}>
          <span className="italic">Pa kategori</span>
          <span className="text-xs font-normal text-muted">{counts.none}</span>
        </button>
      )}

      {error && <p className="px-1 pt-1 text-xs text-warn-700">{error}</p>}

      {adding ? (
        <div className="mt-2">
          <NameForm
            initial=""
            pending={create.isPending}
            onCancel={() => setAdding(false)}
            onSubmit={(name) => create.mutate(name, { onSuccess: () => setAdding(false), onError })}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null)
            setAdding(true)
          }}
          className="mt-2 min-h-10 rounded-lg border border-dashed border-field text-[13px] font-medium text-brand-600 hover:bg-brand-100"
        >
          + Kategori e re
        </button>
      )}
    </aside>
  )
}

/** Phone: horizontally scrolling category chips. */
export function CategoryChips({ categories, counts, value, onChange }: Props) {
  const chip = (active: boolean) =>
    cn(
      'min-h-[38px] shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium',
      active ? 'border-ink bg-ink text-white' : 'border-field bg-white text-ink',
    )
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
      <button type="button" className={chip(value === 'all')} onClick={() => onChange('all')}>
        Të gjitha
      </button>
      {categories.map((c) => (
        <button key={c.id} type="button" className={chip(value === c.id)} onClick={() => onChange(c.id)}>
          {c.name}
        </button>
      ))}
      {counts.none > 0 && (
        <button type="button" className={chip(value === 'none')} onClick={() => onChange('none')}>
          Pa kategori
        </button>
      )}
    </div>
  )
}
