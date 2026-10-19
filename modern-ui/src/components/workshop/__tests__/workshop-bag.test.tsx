import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addToBag, newProfile } from '@/lib/workshop-profile'
import { WorkshopBag } from '../WorkshopBag'

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null))
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function setup(initialTab: 'bag' | 'character' = 'bag') {
  const profile = newProfile()
  const shirt = addToBag(profile, 'uhf-field-vest', 'present')!
  const tag = addToBag(profile, 'plain-tag', 'present')!
  const letter = addToBag(profile, 'handwritten-letter', 'letter', { note: 'Meet by the tree' })!
  const callbacks = { onOpenChange: vi.fn(), onAppearance: vi.fn(), onEquip: vi.fn(), onConsume: vi.fn(), onDrop: vi.fn(), onTitle: vi.fn(), onWriteLetter: vi.fn().mockResolvedValue(true) }
  const props = { open: true, profile, locked: new Set<string>(), initialTab, ...callbacks }
  const view = render(<WorkshopBag {...props} />)
  return { profile, shirt, tag, letter, props, view, ...callbacks }
}

describe('categorized bag and wardrobe', () => {
  it('filters categories and details together, and recovers from empty searches', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /^Clothing/ }))
    expect(screen.getByRole('button', { name: /^UHF Field Vest,/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Plain Tag,/ })).toBeNull()
    expect(within(screen.getByLabelText('Selected item')).getByText('UHF Field Vest')).toBeVisible()
    expect(screen.getByText(/Try-on preview/)).toBeVisible()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search bag' }), { target: { value: 'nothing-matches' } })
    expect(screen.getByText('No finds in this pocket')).toBeVisible()
    expect(within(screen.getByLabelText('Selected item')).queryByText('UHF Field Vest')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }))
    expect(screen.getByRole('button', { name: /^Plain Tag,/ })).toBeVisible()
  })

  it('retains trade reservations on wearable and floor actions', () => {
    const { props, shirt, view, onEquip, onDrop } = setup()
    view.rerender(<WorkshopBag {...props} locked={new Set([shirt.uid])} />)
    fireEvent.click(screen.getByRole('button', { name: /^Clothing/ }))
    expect(screen.getByRole('button', { name: 'Wear' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Drop one on the floor' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Wear' }))
    expect(onEquip).not.toHaveBeenCalled()
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('filters equipped finds, preserves letter text, and supports rarity and sort controls', () => {
    const { profile, props, view } = setup()
    profile.equipped.shirt = 'uhf-field-vest'
    view.rerender(<WorkshopBag {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Equipped' }))
    expect(screen.getByRole('button', { name: /^UHF Field Vest,/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Plain Tag,/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by rarity' }), { target: { value: 'legendary' } })
    expect(screen.getByText('No finds in this pocket')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort bag' }), { target: { value: 'name' } })
    fireEvent.click(screen.getByRole('button', { name: /^Letters/ }))
    expect(within(screen.getByLabelText('Selected item')).getByText('Meet by the tree')).toBeVisible()
  })

  it('opens My elf directly, previews without saving, and applies all free cosmetics together', () => {
    const { profile, onAppearance } = setup('character')
    expect(screen.getByRole('tab', { name: 'My elf' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Female' }))
    fireEvent.click(screen.getByRole('button', { name: 'Haircut: Braids' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hair color: Copper' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wear a starter cap' }))
    expect(profile.appearance.gender).toBe('male')
    expect(onAppearance).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save look' }))
    expect(onAppearance).toHaveBeenCalledWith({ ...profile.appearance, gender: 'female', hairStyle: 'braids', hairColor: 4, starterHat: false })
  })

  it('keeps failed letter drafts and only clears them when mailbox delivery succeeds', async () => {
    const { onWriteLetter } = setup()
    onWriteLetter.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Write a letter' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipient handle' }), { target: { value: '@snowelf' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Letter text' }), { target: { value: 'Hello from the workshop' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send to mailbox' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be delivered')
    expect(screen.getByRole('textbox', { name: 'Letter text' })).toHaveValue('Hello from the workshop')
    fireEvent.click(screen.getByRole('button', { name: 'Send to mailbox' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Letter text' })).toBeNull())
    expect(onWriteLetter).toHaveBeenCalledTimes(2)
  })
})
