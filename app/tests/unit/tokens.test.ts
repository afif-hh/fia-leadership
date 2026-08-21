import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('Design Tokens', () => {
  const tokensPath = resolve(__dirname, '../../assets/css/tokens.css')
  const tokensContent = readFileSync(tokensPath, 'utf-8')

  it('should have all required color tokens', () => {
    const requiredTokens = [
      '--primary-700', '--primary-600', '--primary-500', '--on-primary', '--secondary',
      '--background', '--surface', '--surface-raised', '--surface-sunken', '--border',
      '--border-strong', '--overlay', '--ink-900', '--body-700', '--muted-500',
      '--disabled-400', '--success-700', '--success-bg', '--warning-800', '--warning-bg',
      '--danger-700', '--danger-bg', '--info-700', '--link', '--ring-focus',
    ]
    for (const token of requiredTokens) {
      expect(tokensContent).toContain(`${token}:`)
    }
  })

  it('should have all required typography tokens', () => {
    const requiredTokens = [
      '--font-sans', '--font-mono', '--text-display-lg', '--text-display-md',
      '--text-heading-lg', '--text-heading-md', '--text-heading-sm', '--text-body-lg',
      '--text-body-md', '--text-body-sm', '--text-caption', '--text-button-md',
      '--text-data-value', '--text-code-sm',
    ]
    for (const token of requiredTokens) {
      expect(tokensContent).toContain(`${token}:`)
    }
  })

  it('should have all required spacing tokens', () => {
    const requiredTokens = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-6', '--space-8', '--space-12', '--space-16', '--space-24']
    for (const token of requiredTokens) {
      expect(tokensContent).toContain(`${token}:`)
    }
  })

  it('should have dark mode overrides', () => {
    expect(tokensContent).toContain('[data-theme="dark"]')
    expect(tokensContent).toContain('--primary-600: #60a5fa')
    expect(tokensContent).toContain('--background: #0b1220')
  })

  it('should have reduced motion support', () => {
    expect(tokensContent).toContain('prefers-reduced-motion: reduce')
  })
})
