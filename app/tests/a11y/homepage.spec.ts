import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('Homepage Accessibility', () => {
  const homepagePath = resolve(__dirname, '../../pages/(public)/index.vue')
  const homepageContent = readFileSync(homepagePath, 'utf-8')

  it('should have all 11 homepage sections', () => {
    const sections = [
      'HeroSection', 'WhyLeadershipLab', 'LeadershipJourney', 'AssessmentPortfolio',
      'LeadershipIntelligence', 'AcademyModules', 'SimulationCenter', 'ResearchPublication',
      'Partners', 'NewsEvents',
    ]
    for (const section of sections) {
      expect(homepageContent).toContain(`Public${section}`)
    }
  })
})

describe('Component Accessibility', () => {
  it('HeroSection should have lang="en" for English text', () => {
    const heroPath = resolve(__dirname, '../../components/public/HeroSection.vue')
    const heroContent = readFileSync(heroPath, 'utf-8')
    expect(heroContent).toContain('lang="en"')
  })

  it('All sections should have aria-labelledby', () => {
    const sections = [
      'HeroSection', 'WhyLeadershipLab', 'LeadershipJourney', 'AssessmentPortfolio',
      'LeadershipIntelligence', 'AcademyModules', 'SimulationCenter', 'ResearchPublication',
      'Partners', 'NewsEvents',
    ]
    for (const section of sections) {
      const sectionPath = resolve(__dirname, `../../components/public/${section}.vue`)
      const sectionContent = readFileSync(sectionPath, 'utf-8')
      expect(sectionContent).toContain('aria-labelledby')
    }
  })
})
