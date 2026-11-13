/** İstek gövdelerinin katı doğrulaması (shared/devices.ts tel sözleşmesi). */
import { z } from 'zod'
import type { RemoteCommand } from '../../../../shared/devices'

export const DEVICE_KINDS = ['TV', 'MOBILE', 'WEB'] as const
export const SCREENS = ['login', 'profiles', 'home', 'detail', 'search', 'live', 'guide', 'player', 'other'] as const
export const REMOTE_KEYS = [
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
  'OK',
  'BACK',
  'HOME',
  'SEARCH',
  'GUIDE',
  'PLAY_PAUSE',
  'REWIND',
  'FORWARD',
  'CHANNEL_UP',
  'CHANNEL_DOWN',
  'VOLUME_UP',
  'VOLUME_DOWN',
  'MUTE',
  'SUBTITLES',
  'DIGIT_0',
  'DIGIT_1',
  'DIGIT_2',
  'DIGIT_3',
  'DIGIT_4',
  'DIGIT_5',
  'DIGIT_6',
  'DIGIT_7',
  'DIGIT_8',
  'DIGIT_9',
] as const

export const VIEWABLE_ID_RE = /^(Video|Channel|Airing):[\w-]+$/
export const DEVICE_ID_RE = /^[\w-]{1,64}$/
/** Yalnız uygulama içi hash yolu: '/' ile başlar, '//' ile başlamaz; ters bölü ve denetim karakteri içermez. */
const ROUTE_RE = /^\/(?!\/)[^\\\u0000-\u001f\u007f]*$/
/** Yolda şema geçmez ('https://…', 'javascript:', 'data:'). */
const SCHEME_RE = /[a-z][a-z0-9+.-]*:\/\/|(?:javascript|data|vbscript|file):/i

const zName = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(40))

export const zRegister = z.object({ kind: z.enum(DEVICE_KINDS), name: zName.optional() })
export const zRename = z.object({ name: zName })
export const zTvStart = z.object({ name: zName.optional() }).optional()

const zPosition = z.number().finite().min(0).max(10_000_000)
const zViewableId = z.string().max(80).regex(VIEWABLE_ID_RE)

export const zCommand: z.ZodType<RemoteCommand> = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('KEY'), key: z.enum(REMOTE_KEYS) }),
  z.strictObject({ type: z.literal('TEXT'), text: z.string().max(200), submit: z.boolean().optional() }),
  z.strictObject({
    type: z.literal('CAST'),
    viewableId: zViewableId,
    positionSec: zPosition.optional(),
    startOver: z.boolean().optional(),
    tctx: z.string().max(200).optional(),
  }),
  z.strictObject({ type: z.literal('SEEK'), positionSec: zPosition }),
  z.strictObject({ type: z.literal('VOLUME'), volume: z.number().finite().min(0).max(100) }),
  z.strictObject({ type: z.literal('STOP') }),
  z.strictObject({
    type: z.literal('NAVIGATE'),
    route: z
      .string()
      .max(300)
      .regex(ROUTE_RE)
      .refine((r) => !SCHEME_RE.test(r)),
  }),
  z.strictObject({ type: z.literal('TRANSFER'), toDeviceId: z.string().regex(DEVICE_ID_RE) }),
])

export const zNowPlaying = z.object({
  viewableId: zViewableId,
  title: z.string().max(200),
  subtitle: z.string().max(200).nullable(),
  artUrl: z.string().max(2048).nullable(),
  live: z.boolean(),
  positionSec: zPosition,
  durationSec: zPosition.nullable(),
  paused: z.boolean(),
  volume: z.number().finite().min(0).max(100),
  muted: z.boolean(),
  updatedAt: z.string().max(40),
})

export const zState = z.object({ screen: z.enum(SCREENS), nowPlaying: zNowPlaying.nullable() })

export const zUserCodeBody = z.object({ userCode: z.string().min(1).max(20) })
export const zApprove = z.object({
  userCode: z.string().min(1).max(20),
  profileGuid: z.string().min(1).max(64).nullable().optional(),
})
export const zPoll = z.object({ deviceCode: z.string().min(1).max(100) })
