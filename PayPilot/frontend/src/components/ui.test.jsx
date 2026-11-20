// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './ui'

describe('Modal', () => {
  it('renders into <body>, outside the component that opened it', () => {
    const { container } = render(
      <form aria-label="outer">
        <Modal open title="Dialog" onClose={() => {}}>
          <form aria-label="inner" />
        </Modal>
      </form>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Dialog' })
    expect(container.contains(dialog)).toBe(false)
    expect(document.body.contains(dialog)).toBe(true)
    expect(document.querySelectorAll('form form')).toHaveLength(0) // never nested in the DOM
  })

  it('still closes on Escape and on the close button', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Modal open title="Dialog" onClose={onClose}>content</Modal>)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('renders nothing when closed', () => {
    render(<Modal open={false} title="Dialog" onClose={() => {}}>content</Modal>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
