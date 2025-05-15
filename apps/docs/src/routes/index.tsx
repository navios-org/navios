import { Hero } from '@/pages/hero'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Hero,
})
