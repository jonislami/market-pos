import { Coffee, Pill, Scissors, Shirt, Store, type LucideIcon } from 'lucide-react'

export type BusinessType = 'market' | 'restaurant' | 'pharmacy' | 'boutique' | 'salon'

export interface BusinessProfile {
  type: BusinessType
  label: string
  icon: LucideIcon
  /** Short description shown when choosing the type. */
  description: string
  /** Wording that changes per business; the rest of the app is shared. */
  terms: {
    /** Nav item and page title for the catalogue. */
    products: string
    /** Singular, lower case: "produkt", "artikull", "shërbim"... */
    product: string
    stock: string
  }
}

export const BUSINESS_TYPES: Record<BusinessType, BusinessProfile> = {
  market: {
    type: 'market',
    label: 'Market',
    icon: Store,
    description: 'Barkod, peshë (kg) dhe stok',
    terms: { products: 'Produktet', product: 'produkt', stock: 'Stoku & Hyrjet' },
  },
  restaurant: {
    type: 'restaurant',
    label: 'Kafiterie / Restorant',
    icon: Coffee,
    description: 'Tavolina, porosi, kuzhinë dhe bar',
    terms: { products: 'Menuja', product: 'artikull i menusë', stock: 'Stoku & Hyrjet' },
  },
  pharmacy: {
    type: 'pharmacy',
    label: 'Barnatore',
    icon: Pill,
    description: 'Barna me seri dhe afat skadimi',
    terms: { products: 'Barnat & Produktet', product: 'bar', stock: 'Stoku & Hyrjet' },
  },
  boutique: {
    type: 'boutique',
    label: 'Butik / Veshje & Këpucë',
    icon: Shirt,
    description: 'Madhësi, ngjyra dhe etiketa me barkod',
    terms: { products: 'Artikujt', product: 'artikull', stock: 'Stoku & Hyrjet' },
  },
  salon: {
    type: 'salon',
    label: 'Sallon / Shërbime',
    icon: Scissors,
    description: 'Shërbime, termine dhe punëtorë',
    terms: { products: 'Shërbimet & Produktet', product: 'shërbim', stock: 'Stoku i produkteve' },
  },
}

export const BUSINESS_TYPE_LIST: BusinessProfile[] = Object.values(BUSINESS_TYPES)

export function businessProfile(type: string | null | undefined): BusinessProfile {
  return BUSINESS_TYPES[type as BusinessType] ?? BUSINESS_TYPES.market
}
