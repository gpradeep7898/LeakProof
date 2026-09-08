'use client'

import { usePathname } from 'next/navigation'
import { Frame, Navigation, TopBar } from '@shopify/polaris'
import {
  HomeIcon,
  AlertDiamondIcon,
  ClipboardChecklistIcon,
  PersonIcon,
  InventoryIcon,
  ConnectIcon,
  ChartLineIcon,
} from '@shopify/polaris-icons'
import { useState, useCallback } from 'react'

const NAV_ITEMS = [
  { label: 'Money Snapshot',    href: '/app',            icon: HomeIcon },
  { label: 'Revenue Leak Map',  href: '/app/leaks',      icon: AlertDiamondIcon },
  { label: 'Action Queue',      href: '/app/actions',    icon: ClipboardChecklistIcon },
  { label: 'Customer Segments', href: '/app/segments',   icon: PersonIcon },
  { label: 'Product Catalog',   href: '/app/products',   icon: InventoryIcon },
  { label: 'Data Connect',      href: '/app/connect',    icon: ConnectIcon },
  { label: 'Benchmarks',        href: '/app/benchmarks', icon: ChartLineIcon },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname       = usePathname()
  const [navOpen, setNavOpen] = useState(false)
  const toggleNav      = useCallback(() => setNavOpen((v) => !v), [])

  const logo = {
    width: 36,
    topBarSource:
      'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2036%2036%22%3E%3Crect%20width%3D%2236%22%20height%3D%2236%22%20rx%3D%228%22%20fill%3D%22%230EA5A0%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2254%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22700%22%20font-size%3D%2214%22%20fill%3D%22white%22%3ELP%3C%2Ftext%3E%3C%2Fsvg%3E',
    contextualSaveBarSource: '',
    url: '/app',
    accessibilityLabel: 'LeakProof',
  }

  const topBar = (
    <TopBar showNavigationToggle onNavigationToggle={toggleNav} />
  )

  const navigation = (
    <Navigation location={pathname}>
      <Navigation.Section
        title="LeakProof"
        items={NAV_ITEMS.map((item) => ({
          label:    item.label,
          icon:     item.icon,
          url:      item.href,
          selected: item.href === '/app'
            ? pathname === '/app'
            : pathname.startsWith(item.href),
          onClick:  () => setNavOpen(false),
        }))}
      />
    </Navigation>
  )

  return (
    <Frame
      logo={logo}
      topBar={topBar}
      navigation={navigation}
      showMobileNavigation={navOpen}
      onNavigationDismiss={toggleNav}
    >
      <div style={{ padding: '20px 24px' }}>
        {children}
      </div>
    </Frame>
  )
}
