'use client'

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type FormEvent,
  type SVGProps,
} from 'react'
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
  type Transition,
  type VariantLabels,
  type Target,
  type AnimationControls,
  type TargetAndTransition,
  type Variants,
} from 'framer-motion'

function cn(...classes: (string | undefined | null | boolean)[]): string {
  return classes.filter(Boolean).join(' ')
}

interface RotatingTextRef {
  next: () => void
  previous: () => void
  jumpTo: (index: number) => void
  reset: () => void
}

interface RotatingTextProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof motion.span>,
    'children' | 'transition' | 'initial' | 'animate' | 'exit'
  > {
  texts: string[]
  transition?: Transition
  initial?: boolean | Target | VariantLabels
  animate?: boolean | VariantLabels | AnimationControls | TargetAndTransition
  exit?: Target | VariantLabels
  animatePresenceMode?: 'sync' | 'wait'
  animatePresenceInitial?: boolean
  rotationInterval?: number
  staggerDuration?: number
  staggerFrom?: 'first' | 'last' | 'center' | 'random' | number
  loop?: boolean
  auto?: boolean
  splitBy?: 'characters' | 'words' | 'lines' | string
  onNext?: (index: number) => void
  mainClassName?: string
  splitLevelClassName?: string
  elementLevelClassName?: string
}

const RotatingText = forwardRef<RotatingTextRef, RotatingTextProps>(
  (
    {
      texts,
      transition = { type: 'spring', damping: 25, stiffness: 300 },
      initial = { y: '100%', opacity: 0 },
      animate = { y: 0, opacity: 1 },
      exit = { y: '-120%', opacity: 0 },
      animatePresenceMode = 'wait',
      animatePresenceInitial = false,
      rotationInterval = 2200,
      staggerDuration = 0.01,
      staggerFrom = 'last',
      loop = true,
      auto = true,
      splitBy = 'characters',
      onNext,
      mainClassName,
      splitLevelClassName,
      elementLevelClassName,
      ...rest
    },
    ref,
  ) => {
    const [currentTextIndex, setCurrentTextIndex] = useState<number>(0)

    const splitIntoCharacters = (text: string): string[] => {
      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        try {
          const segmenter = new Intl.Segmenter('en', {
            granularity: 'grapheme',
          })
          return Array.from(
            segmenter.segment(text),
            (segment) => segment.segment,
          )
        } catch (error) {
          console.error(
            'Intl.Segmenter failed, falling back to simple split:',
            error,
          )
          return text.split('')
        }
      }
      return text.split('')
    }

    const elements = useMemo(() => {
      const currentText: string = texts[currentTextIndex] ?? ''
      if (splitBy === 'characters') {
        const words = currentText.split(/(\s+)/)
        let charCount = 0
        return words
          .filter((part) => part.length > 0)
          .map((part) => {
            const isSpace = /^\s+$/.test(part)
            const chars = isSpace ? [part] : splitIntoCharacters(part)
            const startIndex = charCount
            charCount += chars.length
            return {
              characters: chars,
              isSpace: isSpace,
              startIndex: startIndex,
            }
          })
      }
      if (splitBy === 'words') {
        return currentText
          .split(/(\s+)/)
          .filter((word) => word.length > 0)
          .map((word, i) => ({
            characters: [word],
            isSpace: /^\s+$/.test(word),
            startIndex: i,
          }))
      }
      if (splitBy === 'lines') {
        return currentText.split('\n').map((line, i) => ({
          characters: [line],
          isSpace: false,
          startIndex: i,
        }))
      }
      return currentText.split(splitBy).map((part, i) => ({
        characters: [part],
        isSpace: false,
        startIndex: i,
      }))
    }, [texts, currentTextIndex, splitBy])

    const totalElements = useMemo(
      () => elements.reduce((sum, el) => sum + el.characters.length, 0),
      [elements],
    )

    const getStaggerDelay = useCallback(
      (index: number, total: number): number => {
        if (total <= 1 || !staggerDuration) return 0
        const stagger = staggerDuration
        switch (staggerFrom) {
          case 'first':
            return index * stagger
          case 'last':
            return (total - 1 - index) * stagger
          case 'center':
            const center = (total - 1) / 2
            return Math.abs(center - index) * stagger
          case 'random':
            return Math.random() * (total - 1) * stagger
          default:
            if (typeof staggerFrom === 'number') {
              const fromIndex = Math.max(0, Math.min(staggerFrom, total - 1))
              return Math.abs(fromIndex - index) * stagger
            }
            return index * stagger
        }
      },
      [staggerFrom, staggerDuration],
    )

    const handleIndexChange = useCallback(
      (newIndex: number) => {
        setCurrentTextIndex(newIndex)
        onNext?.(newIndex)
      },
      [onNext],
    )

    const next = useCallback(() => {
      const nextIndex =
        currentTextIndex === texts.length - 1
          ? loop
            ? 0
            : currentTextIndex
          : currentTextIndex + 1
      if (nextIndex !== currentTextIndex) handleIndexChange(nextIndex)
    }, [currentTextIndex, texts.length, loop, handleIndexChange])

    const previous = useCallback(() => {
      const prevIndex =
        currentTextIndex === 0
          ? loop
            ? texts.length - 1
            : currentTextIndex
          : currentTextIndex - 1
      if (prevIndex !== currentTextIndex) handleIndexChange(prevIndex)
    }, [currentTextIndex, texts.length, loop, handleIndexChange])

    const jumpTo = useCallback(
      (index: number) => {
        const validIndex = Math.max(0, Math.min(index, texts.length - 1))
        if (validIndex !== currentTextIndex) handleIndexChange(validIndex)
      },
      [texts.length, currentTextIndex, handleIndexChange],
    )

    const reset = useCallback(() => {
      if (currentTextIndex !== 0) handleIndexChange(0)
    }, [currentTextIndex, handleIndexChange])

    useImperativeHandle(ref, () => ({ next, previous, jumpTo, reset }), [
      next,
      previous,
      jumpTo,
      reset,
    ])

    useEffect(() => {
      if (!auto || texts.length <= 1) return
      const intervalId = setInterval(next, rotationInterval)
      return () => clearInterval(intervalId)
    }, [next, rotationInterval, auto, texts.length])

    return (
      <motion.span
        className={cn(
          'inline-flex flex-wrap whitespace-pre-wrap relative align-bottom pb-[10px]',
          mainClassName,
        )}
        {...rest}
        layout
      >
        <span className="sr-only">{texts[currentTextIndex]}</span>
        <AnimatePresence
          mode={animatePresenceMode}
          initial={animatePresenceInitial}
        >
          <motion.div
            key={currentTextIndex}
            className={cn(
              'inline-flex flex-wrap relative',
              splitBy === 'lines'
                ? 'flex-col items-start w-full'
                : 'flex-row items-baseline',
            )}
            layout
            aria-hidden="true"
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {elements.map((elementObj, elementIndex) => (
              <span
                key={elementIndex}
                className={cn(
                  'inline-flex',
                  splitBy === 'lines' ? 'w-full' : '',
                  splitLevelClassName,
                )}
                style={{ whiteSpace: 'pre' }}
              >
                {elementObj.characters.map((char, charIndex) => {
                  const globalIndex = elementObj.startIndex + charIndex
                  return (
                    <motion.span
                      key={`${char}-${charIndex}`}
                      initial={initial}
                      animate={animate}
                      exit={exit}
                      transition={{
                        ...transition,
                        delay: getStaggerDelay(globalIndex, totalElements),
                      }}
                      className={cn(
                        'inline-block leading-none tracking-tight',
                        elementLevelClassName,
                      )}
                    >
                      {char === ' ' ? '\u00A0' : char}
                    </motion.span>
                  )
                })}
              </span>
            ))}
          </motion.div>
        </AnimatePresence>
      </motion.span>
    )
  },
)
RotatingText.displayName = 'RotatingText'

const ShinyText: React.FC<{ text: string; className?: string }> = ({
  text,
  className = '',
}) => (
  <span className={cn('relative overflow-hidden inline-block', className)}>
    {text}
    <span
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
        animation: 'shine 2s infinite linear',
        opacity: 0.5,
        pointerEvents: 'none',
      }}
    ></span>
    <style>{`
            @keyframes shine {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
        `}</style>
  </span>
)

const ChevronDownIcon: React.FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="w-3 h-3 ml-1 inline-block transition-transform duration-200 group-hover:rotate-180"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m19.5 8.25-7.5 7.5-7.5-7.5"
    />
  </svg>
)

const MenuIcon: React.FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-6 h-6"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
    />
  </svg>
)

const CloseIcon: React.FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-6 h-6"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6 18 18 6M6 6l12 12"
    />
  </svg>
)

const ExternalLinkIcon: React.FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-4 h-4 ml-1 opacity-70 group-hover:opacity-100 transition-opacity"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
    />
  </svg>
)

interface NavLinkProps {
  href?: string
  children: ReactNode
  hasDropdown?: boolean
  className?: string
  onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void
}

const NavLink: React.FC<NavLinkProps> = ({
  href = '#',
  children,
  hasDropdown = false,
  className = '',
  onClick,
}) => (
  <motion.a
    href={href}
    onClick={onClick}
    className={cn(
      'relative group text-sm font-medium text-gray-300 hover:text-white transition-colors duration-200 flex items-center py-1',
      className,
    )}
    whileHover="hover"
  >
    {children}
    {hasDropdown && <ChevronDownIcon />}
    {!hasDropdown && (
      <motion.div
        className="absolute bottom-[-2px] left-0 right-0 h-[1px] bg-[#0CF2A0]"
        variants={{
          initial: { scaleX: 0, originX: 0.5 },
          hover: { scaleX: 1, originX: 0.5 },
        }}
        initial="initial"
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    )}
  </motion.a>
)

interface DropdownMenuProps {
  children: ReactNode
  isOpen: boolean
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ children, isOpen }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{
          opacity: 0,
          y: 10,
          scale: 0.95,
          transition: { duration: 0.15 },
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-56 origin-top z-40"
      >
        <div className="bg-[#111111] border border-gray-700/50 rounded-md shadow-xl p-2">
          {children}
        </div>
      </motion.div>
    )}
  </AnimatePresence>
)

interface DropdownItemProps {
  href?: string
  children: ReactNode
  icon?: React.ReactElement<SVGProps<SVGSVGElement>>
}

const DropdownItem: React.FC<DropdownItemProps> = ({
  href = '#',
  children,
  icon,
}) => (
  <a
    href={href}
    className="group flex items-center justify-between w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700/30 hover:text-white rounded-md transition-colors duration-150"
  >
    <span>{children}</span>
    {icon &&
      React.cloneElement(icon, {
        className:
          'w-4 h-4 ml-1 opacity-70 group-hover:opacity-100 transition-opacity',
      })}
  </a>
)

interface Dot {
  x: number
  y: number
  baseColor: string
  targetOpacity: number
  currentOpacity: number
  opacitySpeed: number
  baseRadius: number
  currentRadius: number
}

const InteractiveHero: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameId = useRef<number | null>(null)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [isScrolled, setIsScrolled] = useState<boolean>(false)

  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, 'change', (latest) => {
    setIsScrolled(latest > 10)
  })

  const dotsRef = useRef<Dot[]>([])
  const gridRef = useRef<Record<string, number[]>>({})
  const canvasSizeRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })
  const mousePositionRef = useRef<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  })

  const DOT_SPACING = 25
  const BASE_OPACITY_MIN = 0.4
  const BASE_OPACITY_MAX = 0.5
  const BASE_RADIUS = 1
  const INTERACTION_RADIUS = 150
  const INTERACTION_RADIUS_SQ = INTERACTION_RADIUS * INTERACTION_RADIUS
  const OPACITY_BOOST = 0.6
  const RADIUS_BOOST = 2.5
  const GRID_CELL_SIZE = Math.max(50, Math.floor(INTERACTION_RADIUS / 1.5))

  const handleMouseMove = useCallback((event: globalThis.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) {
      mousePositionRef.current = { x: null, y: null }
      return
    }
    const rect = canvas.getBoundingClientRect()
    const canvasX = event.clientX - rect.left
    const canvasY = event.clientY - rect.top
    mousePositionRef.current = { x: canvasX, y: canvasY }
  }, [])

  const createDots = useCallback(() => {
    const { width, height } = canvasSizeRef.current
    if (width === 0 || height === 0) return

    const newDots: Dot[] = []
    const newGrid: Record<string, number[]> = {}
    const cols = Math.ceil(width / DOT_SPACING)
    const rows = Math.ceil(height / DOT_SPACING)

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = i * DOT_SPACING + DOT_SPACING / 2
        const y = j * DOT_SPACING + DOT_SPACING / 2
        const cellX = Math.floor(x / GRID_CELL_SIZE)
        const cellY = Math.floor(y / GRID_CELL_SIZE)
        const cellKey = `${cellX}_${cellY}`

        if (!newGrid[cellKey]) {
          newGrid[cellKey] = []
        }

        const dotIndex = newDots.length
        newGrid[cellKey].push(dotIndex)

        const baseOpacity =
          Math.random() * (BASE_OPACITY_MAX - BASE_OPACITY_MIN) +
          BASE_OPACITY_MIN
        newDots.push({
          x,
          y,
          baseColor: `rgba(87, 220, 205, ${BASE_OPACITY_MAX})`,
          targetOpacity: baseOpacity,
          currentOpacity: baseOpacity,
          opacitySpeed: Math.random() * 0.005 + 0.002,
          baseRadius: BASE_RADIUS,
          currentRadius: BASE_RADIUS,
        })
      }
    }
    dotsRef.current = newDots
    gridRef.current = newGrid
  }, [
    DOT_SPACING,
    GRID_CELL_SIZE,
    BASE_OPACITY_MIN,
    BASE_OPACITY_MAX,
    BASE_RADIUS,
  ])

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const container = canvas.parentElement
    const width = container ? container.clientWidth : window.innerWidth
    const height = container ? container.clientHeight : window.innerHeight

    if (
      canvas.width !== width ||
      canvas.height !== height ||
      canvasSizeRef.current.width !== width ||
      canvasSizeRef.current.height !== height
    ) {
      canvas.width = width
      canvas.height = height
      canvasSizeRef.current = { width, height }
      createDots()
    }
  }, [createDots])

  const animateDots = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const dots = dotsRef.current
    const grid = gridRef.current
    const { width, height } = canvasSizeRef.current
    const { x: mouseX, y: mouseY } = mousePositionRef.current

    if (!ctx || !dots || !grid || width === 0 || height === 0) {
      animationFrameId.current = requestAnimationFrame(animateDots)
      return
    }

    ctx.clearRect(0, 0, width, height)

    const activeDotIndices = new Set<number>()
    if (mouseX !== null && mouseY !== null) {
      const mouseCellX = Math.floor(mouseX / GRID_CELL_SIZE)
      const mouseCellY = Math.floor(mouseY / GRID_CELL_SIZE)
      const searchRadius = Math.ceil(INTERACTION_RADIUS / GRID_CELL_SIZE)
      for (let i = -searchRadius; i <= searchRadius; i++) {
        for (let j = -searchRadius; j <= searchRadius; j++) {
          const checkCellX = mouseCellX + i
          const checkCellY = mouseCellY + j
          const cellKey = `${checkCellX}_${checkCellY}`
          if (grid[cellKey]) {
            grid[cellKey].forEach((dotIndex) => activeDotIndices.add(dotIndex))
          }
        }
      }
    }

    dots.forEach((dot, index) => {
      dot.currentOpacity += dot.opacitySpeed
      if (
        dot.currentOpacity >= dot.targetOpacity ||
        dot.currentOpacity <= BASE_OPACITY_MIN
      ) {
        dot.opacitySpeed = -dot.opacitySpeed
        dot.currentOpacity = Math.max(
          BASE_OPACITY_MIN,
          Math.min(dot.currentOpacity, BASE_OPACITY_MAX),
        )
        dot.targetOpacity =
          Math.random() * (BASE_OPACITY_MAX - BASE_OPACITY_MIN) +
          BASE_OPACITY_MIN
      }

      let interactionFactor = 0
      dot.currentRadius = dot.baseRadius

      if (mouseX !== null && mouseY !== null && activeDotIndices.has(index)) {
        const dx = dot.x - mouseX
        const dy = dot.y - mouseY
        const distSq = dx * dx + dy * dy

        if (distSq < INTERACTION_RADIUS_SQ) {
          const distance = Math.sqrt(distSq)
          interactionFactor = Math.max(0, 1 - distance / INTERACTION_RADIUS)
          interactionFactor = interactionFactor * interactionFactor
        }
      }

      const finalOpacity = Math.min(
        1,
        dot.currentOpacity + interactionFactor * OPACITY_BOOST,
      )
      dot.currentRadius = dot.baseRadius + interactionFactor * RADIUS_BOOST

      const colorMatch = dot.baseColor.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
      )
      const r = colorMatch ? colorMatch[1] : '87'
      const g = colorMatch ? colorMatch[2] : '220'
      const b = colorMatch ? colorMatch[3] : '205'

      ctx.beginPath()
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${finalOpacity.toFixed(3)})`
      ctx.arc(dot.x, dot.y, dot.currentRadius, 0, Math.PI * 2)
      ctx.fill()
    })

    animationFrameId.current = requestAnimationFrame(animateDots)
  }, [
    GRID_CELL_SIZE,
    INTERACTION_RADIUS,
    INTERACTION_RADIUS_SQ,
    OPACITY_BOOST,
    RADIUS_BOOST,
    BASE_OPACITY_MIN,
    BASE_OPACITY_MAX,
    BASE_RADIUS,
  ])

  useEffect(() => {
    handleResize()
    const handleMouseLeave = () => {
      mousePositionRef.current = { x: null, y: null }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('resize', handleResize)
    document.documentElement.addEventListener('mouseleave', handleMouseLeave)

    animationFrameId.current = requestAnimationFrame(animateDots)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
      document.documentElement.removeEventListener(
        'mouseleave',
        handleMouseLeave,
      )
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current)
      }
    }
  }, [handleResize, handleMouseMove, animateDots])

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isMobileMenuOpen])

  const headerVariants: Variants = {
    top: {
      backgroundColor: 'rgba(17, 17, 17, 0.8)',
      borderBottomColor: 'rgba(55, 65, 81, 0.5)',
      position: 'fixed',
      boxShadow: 'none',
    },
    scrolled: {
      backgroundColor: 'rgba(17, 17, 17, 0.95)',
      borderBottomColor: 'rgba(75, 85, 99, 0.7)',
      boxShadow:
        '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      position: 'fixed',
    },
  }

  const mobileMenuVariants: Variants = {
    hidden: { opacity: 0, y: -20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.2, ease: 'easeOut' },
    },
    exit: {
      opacity: 0,
      y: -20,
      transition: { duration: 0.15, ease: 'easeIn' },
    },
  }

  const contentDelay = 0.3
  const itemDelayIncrement = 0.1

  const bannerVariants: Variants = {
    hidden: { opacity: 0, y: -10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, delay: contentDelay },
    },
  }
  const headlineVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.5, delay: contentDelay + itemDelayIncrement },
    },
  }
  const subHeadlineVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        delay: contentDelay + itemDelayIncrement * 2,
      },
    },
  }
  const formVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        delay: contentDelay + itemDelayIncrement * 3,
      },
    },
  }
  const trialTextVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.5,
        delay: contentDelay + itemDelayIncrement * 4,
      },
    },
  }
  const worksWithVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.5,
        delay: contentDelay + itemDelayIncrement * 5,
      },
    },
  }
  const imageVariants: Variants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: 0.6,
        delay: contentDelay + itemDelayIncrement * 6,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  }

  return (
    <div className="pt-[100px] relative bg-[#111111] text-gray-300 min-h-screen flex flex-col overflow-x-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 pointer-events-none opacity-80"
      />
      <div
        className="absolute inset-0 z-1 pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, transparent 0%, #111111 90%), radial-gradient(ellipse at center, transparent 40%, #111111 95%)',
        }}
      ></div>

      <motion.header
        variants={headerVariants}
        initial="top"
        animate={isScrolled ? 'scrolled' : 'top'}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="px-6 w-full md:px-10 lg:px-16 sticky top-0 z-30 backdrop-blur-md border-b"
      >
        <nav className="flex justify-between items-center max-w-screen-xl mx-auto h-[70px]">
          <div className="flex items-center flex-shrink-0">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2L2 7L12 12L22 7L12 2Z"
                stroke="#0CF2A0"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 17L12 22L22 17"
                stroke="#0CF2A0"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 12L12 17L22 12"
                stroke="#0CF2A0"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xl font-bold text-white ml-2">Navios</span>
          </div>

          <div className="hidden md:flex items-center justify-center flex-grow space-x-6 lg:space-x-8 px-4">
            <NavLink href="#">Product</NavLink>
            <NavLink href="#">Customers</NavLink>

            <div
              className="relative"
              onMouseEnter={() => setOpenDropdown('channels')}
              onMouseLeave={() => setOpenDropdown(null)}
            >
              <NavLink href="#" hasDropdown>
                Channels
              </NavLink>
              <DropdownMenu isOpen={openDropdown === 'channels'}>
                <DropdownItem href="#">Slack</DropdownItem>
                <DropdownItem href="#">Microsoft Teams</DropdownItem>
                <DropdownItem href="#">Discord</DropdownItem>
                <DropdownItem href="#">Email</DropdownItem>
                <DropdownItem href="#">Web Chat</DropdownItem>
              </DropdownMenu>
            </div>

            <div
              className="relative"
              onMouseEnter={() => setOpenDropdown('resources')}
              onMouseLeave={() => setOpenDropdown(null)}
            >
              <NavLink href="#" hasDropdown>
                Resources
              </NavLink>
              <DropdownMenu isOpen={openDropdown === 'resources'}>
                <DropdownItem href="#" icon={<ExternalLinkIcon />}>
                  Blog
                </DropdownItem>
                <DropdownItem href="#">Guides</DropdownItem>
                <DropdownItem href="#">Help Center</DropdownItem>
                <DropdownItem href="#">API Reference</DropdownItem>
              </DropdownMenu>
            </div>

            <NavLink href="#">Docs</NavLink>
            <NavLink href="#">Pricing</NavLink>
          </div>

          <div className="flex items-center flex-shrink-0 space-x-4 lg:space-x-6">
            <NavLink href="#" className="hidden md:inline-block">
              Sign in
            </NavLink>

            <motion.a
              href="#"
              className="bg-[#0CF2A0] text-[#111111] px-4 py-[6px] rounded-md text-sm font-semibold hover:bg-opacity-90 transition-colors duration-200 whitespace-nowrap shadow-sm hover:shadow-md"
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            >
              Book a demo
            </motion.a>

            <motion.button
              className="md:hidden text-gray-300 hover:text-white z-50"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              {isMobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </motion.button>
          </div>
        </nav>

        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              key="mobile-menu"
              variants={mobileMenuVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="md:hidden absolute top-full left-0 right-0 bg-[#111111]/95 backdrop-blur-sm shadow-lg py-4 border-t border-gray-800/50"
            >
              <div className="flex flex-col items-center space-y-4 px-6">
                <NavLink href="#" onClick={() => setIsMobileMenuOpen(false)}>
                  Product
                </NavLink>
                <NavLink href="#" onClick={() => setIsMobileMenuOpen(false)}>
                  Customers
                </NavLink>
                <NavLink href="#" onClick={() => setIsMobileMenuOpen(false)}>
                  Channels
                </NavLink>
                <NavLink href="#" onClick={() => setIsMobileMenuOpen(false)}>
                  Resources
                </NavLink>
                <NavLink href="#" onClick={() => setIsMobileMenuOpen(false)}>
                  Docs
                </NavLink>
                <NavLink href="#" onClick={() => setIsMobileMenuOpen(false)}>
                  Pricing
                </NavLink>
                <hr className="w-full border-t border-gray-700/50 my-2" />
                <NavLink href="#" onClick={() => setIsMobileMenuOpen(false)}>
                  Sign in
                </NavLink>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      <main className="flex-grow flex flex-col items-center justify-center text-center px-4 pt-8 pb-16 relative z-10">
        <motion.div
          variants={bannerVariants}
          initial="hidden"
          animate="visible"
          className="mb-6"
        >
          <ShinyText
            text="Announcing our $15M Series A"
            className="bg-[#1a1a1a] border border-gray-700 text-[#0CF2A0] px-4 py-1 rounded-full text-xs sm:text-sm font-medium cursor-pointer hover:border-[#0CF2A0]/50 transition-colors"
          />
        </motion.div>

        <motion.h1
          variants={headlineVariants}
          initial="hidden"
          animate="visible"
          className="text-4xl sm:text-5xl lg:text-[64px] font-semibold text-white leading-tight max-w-4xl mb-4"
        >
          Deliver collaborative
          <br />{' '}
          <span className="inline-block h-[1.2em] sm:h-[1.2em] lg:h-[1.2em] overflow-hidden align-bottom">
            <RotatingText
              texts={[
                'Support',
                'Experiences',
                'Relationships',
                'Help',
                'Service',
              ]}
              mainClassName="text-[#0CF2A0] mx-1"
              staggerFrom={'last'}
              initial={{ y: '-100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '110%', opacity: 0 }}
              staggerDuration={0.01}
              transition={{ type: 'spring', damping: 18, stiffness: 250 }}
              rotationInterval={2200}
              splitBy="characters"
              auto={true}
              loop={true}
            />
          </span>
        </motion.h1>

        <motion.p
          variants={subHeadlineVariants}
          initial="hidden"
          animate="visible"
          className="text-base sm:text-lg lg:text-xl text-gray-400 max-w-2xl mx-auto mb-8"
        >
          Support your customers on Slack, Microsoft Teams, Discord and many
          more – and move from answering tickets to building genuine
          relationships.
        </motion.p>

        <motion.form
          variants={formVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col sm:flex-row items-center justify-center gap-2 w-full max-w-md mx-auto mb-3"
          onSubmit={(e: FormEvent<HTMLFormElement>) => e.preventDefault()}
        >
          <input
            type="email"
            placeholder="Your work email"
            required
            aria-label="Work Email"
            className="flex-grow w-full sm:w-auto px-4 py-2 rounded-md bg-[#2a2a2a] border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#0CF2A0] focus:border-transparent transition-all"
          />
          <motion.button
            type="submit"
            className="w-full sm:w-auto bg-[#0CF2A0] text-[#111111] px-5 py-2 rounded-md text-sm font-semibold hover:bg-opacity-90 transition-colors duration-200 whitespace-nowrap shadow-sm hover:shadow-md flex-shrink-0"
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            See Nexus in action
          </motion.button>
        </motion.form>

        <motion.p
          variants={trialTextVariants}
          initial="hidden"
          animate="visible"
          className="text-xs text-gray-500 mb-10"
        >
          Free 14 day trial
        </motion.p>

        <motion.div
          variants={worksWithVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center justify-center space-y-2 mb-10"
        >
          <span className="text-xs uppercase text-gray-500 tracking-wider font-medium">
            Works with
          </span>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-gray-400">
            <span className="flex items-center whitespace-nowrap">
              Slack  
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.52118 7.58241C2.52118 8.27634 1.9544 8.8432 1.26059 8.8432C0.566777 8.8432 0 8.27634 0 7.58241C0 6.88849 0.566777 6.32162 1.26059 6.32162H2.52118V7.58241Z"
                  fill="#E21E5B"
                ></path>
                <path
                  d="M3.15625 7.5825C3.15625 6.88858 3.72303 6.32172 4.41684 6.32172C5.11065 6.32172 5.67743 6.88858 5.67743 7.5825V10.7394C5.67743 11.4333 5.11065 12.0002 4.41684 12.0002C3.72303 12.0002 3.15625 11.4333 3.15625 10.7394V7.5825Z"
                  fill="#E21E5B"
                ></path>
                <path
                  d="M4.41684 2.52164C3.72303 2.52164 3.15625 1.95477 3.15625 1.26085C3.15625 0.566928 3.72303 6.10352e-05 4.41684 6.10352e-05C5.11065 6.10352e-05 5.67743 0.566928 5.67743 1.26085V2.52164H4.41684Z"
                  fill="#36C6F0"
                ></path>
                <path
                  d="M4.41695 3.15518C5.11076 3.15518 5.67754 3.72205 5.67754 4.41597C5.67754 5.10989 5.11076 5.67676 4.41695 5.67676H1.26059C0.566777 5.67676 0 5.10989 0 4.41597C0 3.72205 0.566777 3.15518 1.26059 3.15518H4.41695Z"
                  fill="#36C6F0"
                ></path>
                <path
                  d="M9.48047 4.41719C9.48047 3.72327 10.0472 3.1564 10.7411 3.1564C11.4349 3.1564 12.0016 3.72327 12.0016 4.41719C12.0016 5.11111 11.4349 5.67798 10.7411 5.67798H9.48047V4.41719Z"
                  fill="#2EB77D"
                ></path>
                <path
                  d="M8.8454 4.41765C8.8454 5.11157 8.27862 5.67844 7.58481 5.67844C6.89099 5.67844 6.32422 5.11157 6.32422 4.41765V1.26079C6.32422 0.566867 6.89099 0 7.58481 0C8.27862 0 8.8454 0.566867 8.8454 1.26079V4.41765Z"
                  fill="#2EB77D"
                ></path>
                <path
                  d="M7.58481 9.47812C8.27862 9.47812 8.8454 10.045 8.8454 10.7389C8.8454 11.4328 8.27862 11.9997 7.58481 11.9997C6.89099 11.9997 6.32422 11.4328 6.32422 10.7389V9.47812H7.58481Z"
                  fill="#ECB22D"
                ></path>
                <path
                  d="M7.58481 8.8432C6.89099 8.8432 6.32422 8.27634 6.32422 7.58241C6.32422 6.88849 6.89099 6.32162 7.58481 6.32162H10.7412C11.435 6.32162 12.0018 6.88849 12.0018 7.58241C12.0018 8.27634 11.435 8.8432 10.7412 8.8432H7.58481Z"
                  fill="#ECB22D"
                ></path>
              </svg>
            </span>
            <span className="flex items-center whitespace-nowrap">
              Teams  
              <svg width="14" height="13" viewBox="0 0 14 13" fill="none">
                <g clipPath="url(#clip0_2019_82286)">
                  <path
                    d="M9.66723 4.70923H13.1543C13.4838 4.70923 13.7508 4.97629 13.7508 5.30574V8.48201C13.7508 9.6928 12.7693 10.6743 11.5585 10.6743H11.5481C10.3373 10.6745 9.35564 9.69311 9.35547 8.48232C9.35547 8.48221 9.35547 8.48211 9.35547 8.482V5.02099C9.35547 4.84881 9.49505 4.70923 9.66723 4.70923Z"
                    fill="#5059C9"
                  ></path>
                  <path
                    d="M12.0222 4.08135C12.8024 4.08135 13.435 3.44882 13.435 2.66856C13.435 1.8883 12.8024 1.25577 12.0222 1.25577C11.2419 1.25577 10.6094 1.8883 10.6094 2.66856C10.6094 3.44882 11.2419 4.08135 12.0222 4.08135Z"
                    fill="#5059C9"
                  ></path>
                  <path
                    d="M7.62664 4.08134C8.75368 4.08134 9.66734 3.16769 9.66734 2.04064C9.66734 0.913591 8.75368 -6.10352e-05 7.62664 -6.10352e-05C6.49959 -6.10352e-05 5.58594 0.913591 5.58594 2.04064C5.58594 3.16769 6.49959 4.08134 7.62664 4.08134Z"
                    fill="#7B83EB"
                  ></path>
                  <path
                    d="M10.3481 4.70923H4.59208C4.26656 4.71728 4.00905 4.98743 4.0166 5.31296V8.93568C3.97114 10.8892 5.51666 12.5103 7.47009 12.5581C9.42353 12.5103 10.969 10.8892 10.9236 8.93568V5.31296C10.9311 4.98743 10.6736 4.71728 10.3481 4.70923Z"
                    fill="#7B83EB"
                  ></path>
                  <path
                    opacity="0.1"
                    d="M7.78323 4.70923V9.78586C7.78167 10.0187 7.6406 10.2278 7.42533 10.3164C7.35679 10.3454 7.28312 10.3604 7.2087 10.3604H4.29207C4.25126 10.2568 4.21358 10.1532 4.18218 10.0464C4.07229 9.68619 4.01621 9.31169 4.01579 8.93504V5.31202C4.00824 4.98701 4.26532 4.71728 4.59032 4.70923H7.78323Z"
                    fill="black"
                  ></path>
                  <path
                    opacity="0.2"
                    d="M7.46928 4.70923V10.0998C7.46927 10.1742 7.45432 10.2479 7.42533 10.3164C7.33669 10.5317 7.12755 10.6728 6.89475 10.6743H4.43963C4.38626 10.5707 4.33603 10.4671 4.29207 10.3604C4.24811 10.2536 4.21358 10.1532 4.18218 10.0464C4.07229 9.6862 4.01621 9.31169 4.01579 8.93504V5.31202C4.00824 4.98701 4.26532 4.71728 4.59032 4.70923H7.46928Z"
                    fill="black"
                  ></path>
                  <path
                    opacity="0.2"
                    d="M7.46928 4.70923V9.47191C7.46688 9.78822 7.21106 10.044 6.89474 10.0464H4.18218C4.07229 9.68619 4.01621 9.31169 4.01579 8.93504V5.31202C4.00824 4.98701 4.26532 4.71728 4.59032 4.70923H7.46928Z"
                    fill="black"
                  ></path>
                  <path
                    opacity="0.2"
                    d="M7.15532 4.70923V9.47191C7.15293 9.78822 6.8971 10.044 6.58079 10.0464H4.18218C4.07229 9.68619 4.01621 9.31169 4.01579 8.93504V5.31202C4.00824 4.98701 4.26532 4.71728 4.59032 4.70923H7.15532Z"
                    fill="black"
                  ></path>
                  <path
                    opacity="0.1"
                    d="M7.7857 3.0861V4.07505C7.73232 4.07819 7.68209 4.08133 7.62872 4.08133C7.57535 4.08133 7.52512 4.07819 7.47174 4.07505C7.36577 4.06802 7.26067 4.0512 7.15779 4.02482C6.52203 3.87426 5.99679 3.42839 5.745 2.82552C5.70167 2.72428 5.66804 2.61915 5.64453 2.51157H7.21116C7.52797 2.51277 7.78449 2.76928 7.7857 3.0861Z"
                    fill="black"
                  ></path>
                  <path
                    opacity="0.2"
                    d="M7.46893 3.40006V4.07506C7.36296 4.06803 7.25786 4.05122 7.15498 4.02483C6.51922 3.87427 5.99398 3.42841 5.74219 2.82553H6.8944C7.2112 2.82673 7.46772 3.08326 7.46893 3.40006Z"
                    fill="black"
                  ></path>
                  <path
                    opacity="0.2"
                    d="M7.46893 3.40006V4.07506C7.36296 4.06803 7.25786 4.05122 7.15498 4.02483C6.51922 3.87427 5.99398 3.42841 5.74219 2.82553H6.8944C7.2112 2.82673 7.46772 3.08326 7.46893 3.40006Z"
                    fill="black"
                  ></path>
                  <path
                    opacity="0.2"
                    d="M7.15498 3.40007V4.02483C6.51922 3.87427 5.99398 3.42841 5.74219 2.82553H6.58044C6.89725 2.82674 7.15377 3.08326 7.15498 3.40007Z"
                    fill="black"
                  ></path>
                  <path
                    d="M0.825474 2.82553H6.5815C6.89932 2.82553 7.15697 3.08318 7.15697 3.401V9.15703C7.15697 9.47485 6.89932 9.7325 6.5815 9.7325H0.825474C0.507646 9.7325 0.25 9.47485 0.25 9.15703V3.401C0.25 3.08318 0.507652 2.82553 0.825474 2.82553Z"
                    fill="url(#paint0_linear_2019_82286)"
                  ></path>
                  <path
                    d="M5.21652 5.01629H4.06588V8.14955H3.3328V5.01629H2.1875V4.40848H5.21652V5.01629Z"
                    fill="white"
                  ></path>
                </g>
                <defs>
                  <linearGradient
                    id="paint0_linear_2019_82286"
                    x1="1.44988"
                    y1="2.37586"
                    x2="5.9571"
                    y2="10.1822"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#5A62C3"></stop>
                    <stop offset="0.5" stopColor="#4D55BD"></stop>
                    <stop offset="1" stopColor="#3940AB"></stop>
                  </linearGradient>
                  <clipPath id="clip0_2019_82286">
                    <rect
                      width="13.5"
                      height="12.5581"
                      fill="white"
                      transform="translate(0.25 -6.10352e-05)"
                    ></rect>
                  </clipPath>
                </defs>
              </svg>
            </span>
            <span className="flex items-center whitespace-nowrap">
              Discord  
              <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
                <path
                  d="M11.6783 1.68101C10.8179 1.28619 9.89518 0.995304 8.93044 0.828702C8.91287 0.825486 8.89532 0.833522 8.88627 0.849593C8.76761 1.06066 8.63616 1.33601 8.54411 1.55243C7.50648 1.39708 6.47417 1.39708 5.45781 1.55243C5.36574 1.3312 5.22952 1.06066 5.11032 0.849593C5.10127 0.834058 5.08372 0.826023 5.06615 0.828702C4.10195 0.994772 3.17925 1.28566 2.31828 1.68101C2.31082 1.68422 2.30443 1.68959 2.30019 1.69655C0.550033 4.31133 0.0705905 6.86184 0.305789 9.38073C0.306853 9.39305 0.313771 9.40484 0.323349 9.41233C1.47805 10.2603 2.59659 10.7752 3.69434 11.1164C3.71191 11.1218 3.73053 11.1153 3.74171 11.1009C4.00138 10.7462 4.23286 10.3723 4.43133 9.9791C4.44304 9.95607 4.43186 9.92875 4.40792 9.91964C4.04076 9.78036 3.69115 9.61054 3.35485 9.41769C3.32825 9.40216 3.32612 9.36411 3.35059 9.34589C3.42136 9.29286 3.49215 9.23768 3.55972 9.18197C3.57195 9.17179 3.58899 9.16965 3.60336 9.17607C5.81272 10.1848 8.20462 10.1848 10.3879 9.17607C10.4023 9.16911 10.4193 9.17126 10.4321 9.18143C10.4997 9.23715 10.5704 9.29286 10.6417 9.34589C10.6662 9.36411 10.6646 9.40216 10.638 9.41769C10.3017 9.61428 9.95211 9.78036 9.58441 9.91911C9.56047 9.92822 9.54983 9.95607 9.56154 9.9791C9.76427 10.3718 9.99574 10.7457 10.2506 11.1003C10.2613 11.1153 10.2804 11.1218 10.298 11.1164C11.4011 10.7752 12.5196 10.2603 13.6743 9.41233C13.6844 9.40484 13.6908 9.39358 13.6919 9.38126C13.9734 6.46915 13.2204 3.93955 11.6959 1.69708C11.6921 1.68959 11.6858 1.68422 11.6783 1.68101ZM4.76126 7.84699C4.09609 7.84699 3.54801 7.23629 3.54801 6.4863C3.54801 5.7363 4.08546 5.12561 4.76126 5.12561C5.44237 5.12561 5.98514 5.74167 5.97449 6.4863C5.97449 7.23629 5.43704 7.84699 4.76126 7.84699ZM9.24705 7.84699C8.58189 7.84699 8.03381 7.23629 8.03381 6.4863C8.03381 5.7363 8.57125 5.12561 9.24705 5.12561C9.92817 5.12561 10.4709 5.74167 10.4603 6.4863C10.4603 7.23629 9.92817 7.84699 9.24705 7.84699Z"
                  fill="#5865F2"
                ></path>
              </svg>
            </span>
            <span className="flex items-center whitespace-nowrap">
              Email  
              <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M0.5 7.00012C0.5 6.58591 0.835786 6.25012 1.25 6.25012H5.3C5.55076 6.25012 5.78494 6.37545 5.92404 6.5841L7.05139 8.27512H8.94861L10.076 6.5841C10.2151 6.37545 10.4492 6.25012 10.7 6.25012H14.75C15.1642 6.25012 15.5 6.58591 15.5 7.00012C15.5 7.41434 15.1642 7.75012 14.75 7.75012H11.1014L9.97404 9.44115C9.83494 9.6498 9.60076 9.77512 9.35 9.77512H6.65C6.39923 9.77512 6.16506 9.6498 6.02596 9.44115L4.89861 7.75012H1.25C0.835786 7.75012 0.5 7.41434 0.5 7.00012Z"
                  fill="#9898A9"
                ></path>
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M4.787 0.849976L11.213 0.849976C11.6037 0.850183 11.987 0.959373 12.319 1.16527C12.6506 1.37092 12.9184 1.66491 13.0923 2.01424C13.0925 2.01465 13.0927 2.01506 13.0929 2.01548L15.4206 6.66418C15.4728 6.76842 15.5 6.88354 15.5 7.00012V11.05C15.5 11.6069 15.2787 12.1411 14.8849 12.5349C14.4911 12.9287 13.957 13.15 13.4 13.15H2.6C2.04304 13.15 1.5089 12.9287 1.11508 12.5349C0.721249 12.1411 0.5 11.6069 0.5 11.05V7.00012C0.5 6.88354 0.527177 6.76842 0.579374 6.66418L2.9071 2.01548C2.90728 2.01511 2.90747 2.01474 2.90765 2.01437C3.08152 1.66498 3.34932 1.37095 3.681 1.16527C4.01303 0.959373 4.39631 0.850183 4.787 0.849976ZM4.78726 2.34998C4.67568 2.35006 4.56634 2.38126 4.47151 2.44006C4.37665 2.49889 4.30007 2.58301 4.2504 2.68298L4.24938 2.68503L2 7.17726V11.05C2 11.2091 2.06321 11.3617 2.17574 11.4742C2.28826 11.5868 2.44087 11.65 2.6 11.65H13.4C13.5591 11.65 13.7117 11.5868 13.8243 11.4742C13.9368 11.3617 14 11.2091 14 11.05V7.17726L11.7506 2.68503L11.7496 2.68298C11.6999 2.58301 11.6234 2.49889 11.5285 2.44006C11.4337 2.38126 11.3243 2.35006 11.2127 2.34998H4.78726Z"
                  fill="#9898A9"
                ></path>
              </svg>
            </span>
            <span className="flex items-center whitespace-nowrap">
              AND MORE
            </span>
          </div>
        </motion.div>

        <motion.div
          variants={imageVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-4xl mx-auto px-4 sm:px-0"
        >
          <img
            src="https://help.apple.com/assets/679AD2D1E874AD22770DE1E0/679AD2D56EA7B10C9E01288F/en_US/3d2b57c8027ae355aa44421899389008.png"
            alt="Product screen preview showing collaborative features"
            width={1024}
            height={640}
            className="w-full h-auto object-contain rounded-lg shadow-xl border border-gray-700/50"
            loading="lazy"
          />
        </motion.div>
      </main>
    </div>
  )
}

export default InteractiveHero
