import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('existing starter application', () => {
  it('renders the current landing screen', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Get started' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore Vite' })).toHaveAttribute(
      'href',
      'https://vite.dev/',
    )
  })

  it('increments the counter when clicked', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Count is 0' }))
    expect(screen.getByRole('button', { name: 'Count is 1' })).toBeInTheDocument()
  })
})
