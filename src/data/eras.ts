export type SpatialPosition =
  | 'Left Rear'
  | 'Left Front'
  | 'Right Front'
  | 'Right Rear'
  | 'Front'

export type DialPlacement =
  | 'top-right'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-left'
  | 'top-center'
  | 'bottom-center'

export type EraTheme =
  | 'baroque'
  | 'classical'
  | 'romantic'
  | 'modern'
  | 'contemporary'

export interface EraData {
  id: string
  name: string
  years: string
  history: string
  literature: string
  audioTechnique: string
  audioSrc: string
  spatialPosition: SpatialPosition
  theme: EraTheme
  dialPlacement: DialPlacement
  dialReveal: number
  chapter: string
  /** Align main content block to left or right side of the viewport */
  contentSide?: 'left' | 'right' | 'default'
  /** Title block and research panels side-by-side */
  contentLayout?: 'stacked' | 'horizontal' | 'continued'
  /** Bottom arc appears independently — no morph from prior corner dial */
  dialIndependent?: boolean
  /** Compact year range shown on the dial arc beside era name */
  dialYear?: string
}

export const INTRO_TITLE = 'The Metronome and the Journey of Musical Time'
export const INTRO_AUDIO_SRC = '/audio/introduction.mp3'

export const eras: EraData[] = [
  {
    id: 'baroque',
    chapter: '01',
    name: 'Baroque',
    years: '1600 – 1750',
    history: '',
    literature: '',
    audioTechnique: '',
    audioSrc: '/audio/baroque.mp3',
    spatialPosition: 'Left Rear',
    theme: 'baroque',
    dialPlacement: 'top-right',
    dialReveal: 90,
    contentSide: 'left',
    dialYear: '1600–1750',
  },
  {
    id: 'classical',
    chapter: '02',
    name: 'Classical',
    years: '1750 – 1820',
    history: '',
    literature: '',
    audioTechnique: '',
    audioSrc: '/audio/classical.mp3',
    spatialPosition: 'Left Front',
    theme: 'classical',
    dialPlacement: 'bottom-right',
    dialReveal: 90,
    contentSide: 'left',
    dialYear: '1750–1820',
  },
  {
    id: 'romantic',
    chapter: '03',
    name: 'Romantic',
    years: '1820 – 1910',
    history: '',
    literature: '',
    audioTechnique: '',
    audioSrc: '/audio/romantic.mp3',
    spatialPosition: 'Right Front',
    theme: 'romantic',
    dialPlacement: 'bottom-left',
    dialReveal: 90,
    contentSide: 'right',
    dialYear: '1820–1910',
  },
  {
    id: 'modern-electronic',
    chapter: '04',
    name: 'Modern & Electronic',
    years: '1910 – 2000',
    history: '',
    literature: '',
    audioTechnique: '',
    audioSrc: '/audio/modern-electronic.mp3',
    spatialPosition: 'Right Rear',
    theme: 'modern',
    dialPlacement: 'top-left',
    dialReveal: 90,
    contentSide: 'right',
    dialYear: '1910–2000',
  },
  {
    id: 'contemporary-ai',
    chapter: '05',
    name: 'Contemporary & AI',
    years: '2000 – Present',
    history: '',
    literature: '',
    audioTechnique: '',
    audioSrc: '/audio/contemporary-ai.mp3',
    spatialPosition: 'Front',
    theme: 'contemporary',
    dialPlacement: 'bottom-center',
    dialReveal: 210,
    dialIndependent: true,
    contentLayout: 'continued',
    dialYear: '2000–Now',
  },
]
