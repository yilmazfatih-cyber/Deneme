# Netflix System Design: A Grounded Teardown

A reverse-engineered system design of Netflix's web application, built entirely from live network traffic analysis of the authenticated browse experience. 177 requests captured, every API contract inspected, every subsystem named.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BROWSER (Akira SPA)                                                        │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │  React UI    │  │   Cadmium    │  │  Ichnaea     │  │  FTL Probe    │   │
│  │  Hawkins 5.13│  │   Player     │  │  Logger      │  │  Client       │   │
│  └──┬───┬───┬───┘  └──┬──────┬───┘  └──────┬───────┘  └───────┬───────┘   │
│     │   │   │         │      │              │                  │           │
│     │   │   │    ┌────┘      │              │                  │           │
│     │   │   │    │  MSL      │              │                  │           │
│     │   │   │    │  Layer    │              │                  │           │
└─────┼───┼───┼────┼──────────┼──────────────┼──────────────────┼───────────┘
      │   │   │    │          │              │                  │
      │   │   │    │          │              │                  │
┌─────┼───┼───┼────┼──────────┼──────────────┼──────────────────┼───────────┐
│  EDGE│   │   │    │          │              │                  │           │
│     ▼   ▼   │    ▼          │              │                  │           │
│  ┌──────────────────────┐   │              │                  │           │
│  │    Envoy Proxy       │   │              │                  │           │
│  │    (us-west-2)       │   │              │                  │           │
│  └──┬───┬───┬───┬───────┘   │              │                  │           │
└─────┼───┼───┼───┼───────────┼──────────────┼──────────────────┼───────────┘
      │   │   │   │           │              │                  │
┌─────┼───┼───┼───┼───────────┼──────────────┼──────────────────┼───────────┐
│  BACKEND SERVICES           │              │                  │           │
│     │   │   │   │           │              │                  │           │
│     ▼   │   │   ▼           │              ▼                  ▼           │
│  ┌──────┴┐ ┌┴────────┐ ┌───┴──────┐  ┌─────────┐     ┌───────────┐      │
│  │GraphQL│ │ Shakti   │ │ Play API │  │Ichnaea  │     │FTL Service│      │
│  │  API  │ │(Falcor)  │ │(manifest)│  │(events) │     │(probing)  │      │
│  └───────┘ └─────────┘ └────┬─────┘  └─────────┘     └─────┬─────┘      │
│                              │                              │            │
│                         ┌────▼─────┐                        │            │
│                         │ MSL/ALE  │                        │            │
│                         │(DRM auth)│                        │            │
│                         └──────────┘                        │            │
└─────────────────────────────────────────────────────────────┼────────────┘
                                                              │
┌─────────────────────────────────────────────────────────────┼────────────┐
│  CONTENT DELIVERY                                           │            │
│                                                             ▼            │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────────────┐    │
│  │  Image API      │  │ Static CDN   │  │  Open Connect CDN        │    │
│  │  occ.nflxso.net │  │ assets.      │  │  oca.nflxvideo.net       │    │
│  │  /dnm/api/v6/   │  │ nflxext.com  │  │  (ISP-embedded servers)  │    │
│  └─────────────────┘  └──────────────┘  └──────────────────────────┘    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  Akamai (ae.nflximg.net) -- ad tech iframes only                │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘

THIRD-PARTY: Chromecast (cast_sender.js) · OneTrust (consent) · Monet (ad tech, sandboxed)
```

## The Two API Systems

Netflix runs **two parallel API systems** on the authenticated browse experience. This is the most architecturally interesting finding -- they're mid-migration from Falcor/Shakti to GraphQL, and both are live in production.

### 1. GraphQL API (New System)

**Endpoint:** `POST https://web.prod.cloud.netflix.com/graphql`

All queries use **persisted queries** -- the client sends a UUID + version, never the raw query string.

| Operation Name | Persisted Query ID | Purpose |
|---|---|---|
| `CLCSInterstitialLolomo` | `d95a8741-43d4-432c-b8ec-8799062ba8a4` | Content lifecycle states / interstitials for the browse page |
| `DetailModal` | `76c01761-731d-48bd-8ce9-81c37e0bb3a3` | Full title metadata (cast, genres, episodes, maturity, synopsis, similar titles) |
| `MembershipStatus` | `3f50f3b3-fff8-48c0-bbd3-5fa2cb04b3c1` | Check if visitor has an active account |
| `MiniModalQuery` | `ec38bae4-2d3f-4f51-840e-f60ad596e3d1` | Batch-fetch hover card data for a row of titles (artwork, badges, rating, promoVideo) |
| `SearchPageQueryResults` | `2d95424b-9dbe-4063-95a5-e59bb39e07b9` | Full search results with suggestions, collections, and entity matching |

**What the DetailModal query returns** (actual response for Bridgerton):
```
- __typename: "Show"
- videoId: 80232398
- title, synopsis, contextualSynopsis
- cast (37 actors with personId), creators, directors
- genreTags: ["Romantic TV Dramas", "TV Dramas", "TV Shows Based on Books", "Period Pieces"]
- moodTags: ["Swoonworthy", "Witty", "Period Piece", "Notable Soundtrack", "Critically Acclaimed"]
- contentAdvisory: TV-MA with reasons ["sex", "nudity", "sexual violence", "substances", "language", "smoking"]
- seasons: { totalCount: 4 }
- currentEpisode: { videoId: 81508516, season 3, episode 1, runtimeSec: 3507 }
- playbackBadges: ["VIDEO_SD", "OFFLINE_DOWNLOAD_AVAILABLE", "AUDIO_ASSISTIVE", "VIDEO_HD", "TEXT_CLOSED_CAPTIONS", "AUDIO_FIVE_DOT_ONE"]
- isInPlaylist: true/false
- similars: [array of videoIds]
- supplementalVideosList (trailers)
```

### 2. Shakti / Falcor API (Legacy System)

**Endpoint:** `POST https://www.netflix.com/nq/website/memberapi/release/pathEvaluator`

This is Netflix's original API, based on the **Falcor** data-fetching library (Netflix open-sourced this). The client sends JSON path expressions and gets back a JSON graph.

**Query params reveal capabilities:**
```
?webp=true
&drmSystem=widevine
&isVolatileBillboardsEnabled=true
&isTop10Supported=true
&hasVideoMerchInBob=true      # "BOB" = Back of Billboard
&hasVideoMerchInJaw=true       # "JAW" = the expandable title detail panel
&falcor_server=0.1.0
&withSize=true
&materialize=true
```

**Request body** (URL-encoded Falcor paths):
```
path=["usp","cloudGames","hasMerchedBetaMessage"]
&authURL=c1.1772324348872.AgiMlOvcAxIg...
```

**Response** (Falcor JSON Graph format):
```json
{
  "paths": [["usp","cloudGames","hasMerchedBetaMessage"]],
  "jsonGraph": {
    "usp": {
      "cloudGames": {
        "hasMerchedBetaMessage": {"$type":"atom","value":false}
      }
    }
  }
}
```

The **ESN** (Electronic Serial Number) format `NFCDCH-MC-*` identifies: `NF` (Netflix) + `CDCH` (Cadmium Chrome) + `MC` (Mac) + unique device hash. This ESN is sent on every Shakti call via `x-netflix.esn` header.

## Search Architecture (Pinot)

Netflix's search is powered by a system internally called **Pinot** (visible in the GraphQL response types: `PinotDefaultQuerySearchPage`, `PinotGallerySection`, `PinotListSection`, `PinotStandardBoxshotEntityTreatment`).

The `SearchPageQueryResults` query is the most complex GraphQL call observed -- a 2KB request body that declares the client's **rendering capabilities** upfront so the server can tailor responses:

```json
{
  "searchTerm": "breaking bad",
  "options": {
    "pageCapabilities": {
      "capabilitiesBySection": {
        "pinotGallery": {
          "capabilitiesBySectionTreatment": {
            "pinotStandard": {
              "capabilitiesByEntityTreatment": {
                "pinotStandardBoxshot": { "canHandleEntityKinds": ["VIDEO"] },
                "pinotStandardCloudAppIcon": { "canHandleEntityKinds": ["GAME"] },
                "pinotStandardMobileAppIcon": { "canHandleEntityKinds": ["GAME"] },
                "pinotStandardDestination": { "canHandleEntityKinds": ["GENERIC_CONTAINER"] }
              }
            }
          }
        }
      }
    }
  }
}
```

This is a **capability-negotiation pattern** -- the client tells the server "I can render boxshots for videos, cloud app icons for games, and destination links for collections" and the server only returns entity types the client can handle. This lets the server evolve (add new entity types, new layout treatments) without breaking older clients.

The response comes back as two sections:
1. **`PinotListSection`** ("More to explore") -- typeahead suggestions including `Collection:81137441` ("Breaking Bad Collection") and individual title suggestions
2. **`PinotGallerySection`** ("Movies & TV") -- 48 matching titles with boxart, each including `contextualArtwork` that's personalized per query context

Search results expire: `"expires": "2026-03-01T08:31:17.770Z"` -- the server tells the client when to refetch if the user returns to the same query.

## Hover Previews (MiniModalQuery)

When you hover over a title card, Netflix fires a **`MiniModalQuery`** that batch-fetches data for the entire row at once (not just the hovered title). This is a prefetch optimization -- by the time you hover the next card, its data is already cached.

Each title in the MiniModal response includes:
- `promoVideo` -- a short preview clip with `computeId` and `offset` (where to start playback)
- `textEvidence` -- mood/tag descriptors like "Violent, Period Piece, Notable Soundtrack, Vintage Crime, 1920s, British"
- `thumbsRating` -- the user's rating state (`THUMBS_UNRATED`, `THUMBS_UP`, etc.)
- `watchStatus` -- `NEVER_WATCHED`, `STARTED`, or `WATCHED`
- `playlistActions` -- `ADD_TO_PLAYLIST` or `DELETE_FROM_PLAYLIST`
- Multiple artwork variants: `boxart`, `boxartHighRes`, `storyArt`, `titleLogoBranded`, `titleLogoUnbranded`, `brandLogoSmall`

The `textEvidenceUiContext` field toggles between `"BOB"` (Back of Billboard) and `"ODP"` (Original Detail Page?) to control which tag format the server returns.

## Video Streaming Pipeline

### Step 1: FTL Network Probing

Before any video plays, Netflix runs **FTL (Faster Than Light)** probes to find the best Open Connect Appliance (OCA):

```
GET /api/ftl/probe?monotonic=false&device=web&iter=0
```

Response provides 4 probe targets to race:
```json
{
  "urls": [
    {"name": "resolver",       "url": "https://ifurxi7eqxmp4zrznbjwc-us-west-2.r.nflxso.net/ftl/probe?data=5120"},
    {"name": "oc.anycast.proxy","url": "https://anycast.ftl.netflix.com/ftl/probe?data=5120"},
    {"name": "oc.ix.proxy",    "url": "https://ipv4-c338-sjc002-ix.ftl.nflxvideo.net/ftl/probe?data=5120"},
    {"name": "aws",            "url": "https://oca-api.netflix.com/ftl/probe?data=5120"}
  ],
  "pulse_delays": [0, 2000, 70000],
  "pulses": 3,
  "ctx": {"ip": "136.226.78.118", "region": "us-west-2", "device": "web"}
}
```

This tells you the actual CDN selection algorithm: **the client races 4 endpoints** (DNS resolver, anycast, IX peering point, AWS fallback) and picks the fastest. The `sjc002-ix` in the hostname = SJC (San Jose) Internet Exchange point.

### Step 2: MSL Token Provisioning (ALE)

Before requesting a DRM manifest, the client provisions authentication tokens via **MSL (Message Security Layer)**:

```
POST /nq/msl_v1/nrdjs/pbo_tokens/^1.0.0/router?reqName=aleProvision
```

The request body is entirely **encrypted** -- JSON with `mastertoken`, `headerdata` (base64-encoded encrypted header), and `payload` (base64-encoded encrypted payload). The `Content-Encoding: msl_v1` header signals this custom protocol.

MSL tokens include:
- `sessiondata` (encrypted session blob)
- `renewalwindow` and `expiration` timestamps
- `serialnumber` and `sequencenumber` for replay protection

### Step 3: Licensed Manifest (DRM)

```
POST /msl/playapi/cadmium/licensedmanifest/1
?reqName=prefetch/licensedManifest
&mainContentViewableId=81508516    # Bridgerton S3E1
&clienttype=akira
&browsername=chrome&browserversion=145.0.0.0
```

The entire request/response is **MSL-encrypted**. The 32KB request body contains the MSL mastertoken + encrypted manifest request. The response contains:
- Widevine DRM license
- Available stream URLs on Open Connect
- Audio/video codec negotiation
- Subtitle manifest URLs

**Key detail:** This fires as a **prefetch** on the browse page -- Netflix pre-fetches the DRM manifest for the billboard title before you even click play.

### Step 4: Byte-Range Video Streaming

Once the manifest is obtained, the Cadmium player streams from the nearest OCA via **HTTP byte-range requests**:

```
GET https://ipv4-c345-sjc002-ix.1.oca.nflxvideo.net/range/0-4095?o=1&v=31&e=1772367549&t=<signed_token>
GET .../range/1543-675647    (video segment)
GET .../range/2935-27888     (audio segment)
GET .../range/675648-910863  (next video segment)
...
```

**Observations from the traffic:**
- Two parallel streams: audio and video are fetched independently
- Video chunks: ~300KB-600KB each (adaptive based on bandwidth)
- Audio chunks: ~25KB-50KB each
- Token `e=1772367549` is the expiry timestamp (~12 hours from now)
- Token `t=` is a signed URL token (prevents hotlinking)
- Server is `freenginx` running on the OCA appliance
- `x-tcp-info: addr=136.226.78.118;port=55487` header exposes TCP connection metadata for QoS monitoring

### Step 5: Subtitles (TTML)

Subtitles stream as **TTML/XML** documents from the OCA, not WebVTT:

```xml
<tt xmlns="http://www.w3.org/ns/ttml"
    xmlns:nttm="http://www.netflix.com/ns/ttml#metadata"
    ttp:tickRate="10000000">
  <p begin="14612515t" end="32565033t">
    <span>Are you looking for something?</span>
  </p>
</tt>
```

Netflix uses high-precision tick-based timing (10M ticks/sec) for frame-accurate subtitle sync.

## The Cadmium Player

Netflix's web player is called **Cadmium** (`cadmium-playercore-6.0055.377.911.js`). It's loaded async on the browse page and handles:

- DRM license negotiation (Widevine for Chrome)
- Adaptive bitrate streaming (ABR)
- MSL protocol encryption/decryption
- Byte-range HTTP streaming (no DASH manifest -- custom protocol)
- Subtitle rendering (TTML)
- Chromecast integration (`cast_sender.js` loaded alongside)
- Audio track switching (5.1 surround support)

The player uses **Widevine CDM** (Content Decryption Module) built into Chrome. The `drmSystem=widevine` param in Shakti calls confirms this.

## Event Logging (Ichnaea)

Three distinct logging endpoints serve different isolation contexts:

| Endpoint | Origin Context | Purpose |
|---|---|---|
| `logs.netflix.com/log/www/cl/2` | First-party (www) | Page events, screen dimensions, user interactions |
| `www.netflix.com/ichnaea/log` | First-party proxy | Ad vendor sync events (forwarded from iframe) |
| `ichnaea-web.netflix.com/log` | Cross-site (ad iframe) | Ad tech tag firing confirmation |

**Ichnaea event payloads** include:
```json
{
  "events": [{
    "name": "advdevtag",
    "data": {
      "advdevtag_type": "web",
      "ad_vendor_sync_type": "netflix",
      "tags": ["adwords_Simplicity_NMLanding", "fb_simplicity_nmLanding", "tiktok_nmLanding"],
      "tagLoaderVersion": "20260225-1124",
      "event_ts": 1772323947
    }
  }]
}
```

Rate limiting is visible in response headers: `x-ichnaea: ~0=true~RL=2212`

## Push Notifications

Netflix attempts a **long-poll connection** to `notifications.netflix.com/push` on page load. In this capture it returned `net::ERR_EMPTY_RESPONSE` (no pending notifications). The `pushnotify.js` script loaded from `assets.netflix.com` manages this connection.

## Identity & Auth Architecture

### Cookie Chain (Authenticated)

| Cookie | TTL | Purpose | Security |
|---|---|---|---|
| `NetflixId` | 1 year | Primary session + profile GUID (`pg=LAQPMOV7TNE6VC2US7RJZ6T2..`) | HttpOnly, Secure, SameSite=Lax |
| `SecureNetflixId` | 1 year | Auth MAC token | HttpOnly, Secure, SameSite=Strict |
| `nfvdid` | 1 year | Device fingerprint (Virtual Device ID) | Domain-wide |
| `gsid` | 24h | Growth session (conversion tracking) | SameSite=None |
| `flwssn` | 3h | Signup flow session | Domain-wide |
| `profilesNewSession` | Session | Tracks profile selection state | Domain-wide |
| `OptanonConsent` | Persistent | Privacy consent groups (C0001-C0004) | Domain-wide |

### Profile Identity

The profile GUID `LAQPMOV7TNE6VC2US7RJZ6T2..` appears in three places:
1. Encoded in the `NetflixId` cookie (`pg=LAQPMOV7TNE6VC2US7RJZ6T2..`)
2. Sent as `x-netflix.request.client.user.guid` header on Shakti calls
3. Returned as `x-netflix-passport.fromorigin.profileguid` in response headers

Netflix internally calls this the **Passport** system -- `x-netflix-passport.fromorigin.profileguid` header confirms the profile identity was resolved from the auth cookie.

### Device Identity (ESN)

The **Electronic Serial Number** format: `NFCDCH-MC-MU713AQA0KQ6TMFCVF9VV36N03J1..`

- `NF` = Netflix
- `CDCH` = Cadmium Chrome (player type)
- `MC` = Mac (platform)
- `MU713AQA0KQ6...` = unique device hash

This ESN is used in DRM license requests and Shakti API calls to enforce device limits and select appropriate codec profiles.

## Content Data Model

From the GraphQL responses, Netflix's content model:

```
VIDEO (base entity)
├── videoId: int (PK)                        ┌──────────────────────┐
├── title: string                            │  SHOW extends VIDEO  │
├── __typename: Show | Movie | Episode       │  ├── numSeasons: 4   │
├── unifiedEntityId: "Video:80232398"        │  └── seasons[]───────┼──► SEASON
├── isAvailable, isPlayable: bool            │                      │    ├── number: 3
├── latestYear: int                          └──────────────────────┘    ├── numberLabel: "S3"
│                                                                        └── episodes[]──► EPISODE
├──► cast[]: PERSON {personId, name}                                          ├── number: 1
├──► creators[]: PERSON                                                       ├── title: "Out of..."
├──► directors[]: PERSON                                                      ├── runtimeSec: 3507
│                                                                             ├── watchStatus: NEVER_WATCHED
├──► genreTags[]: GENRE {genreId, name}                                       │    | IN_PROGRESS | WATCHED
│    e.g. "Romantic TV Dramas", "Period Pieces"                               └── bookmark: {position, ts}
│
├──► moodTags[]: {id, displayName, isMood}
│    e.g. "Swoonworthy" (mood), "Critically Acclaimed" (not mood)
│
├──► contentAdvisory: {certificationValue: "TV-MA", maturityLevel: 110,
│    reasons: ["sex","nudity","sexual violence","substances","language","smoking"]}
│
├──► similars[]: VIDEO[] (related titles by videoId)
├──► supplementalVideosList[]: SUPPLEMENTAL[] (trailers, behind-the-scenes)
├──► playbackBadges[]: ["VIDEO_HD","AUDIO_FIVE_DOT_ONE","TEXT_CLOSED_CAPTIONS",...]
├──► isInPlaylist: bool
└──► playlistActions[]: ["ADD_TO_PLAYLIST"] | ["DELETE_FROM_PLAYLIST"]
```

### Row/Carousel Data Model (Lolomo)

Netflix calls their browse page layout a **"Lolomo"** (List of Lists of Movies). Each row is a list with:
- A `heading` ("Top 10 TV Shows in the U.S. Today", "Gems for You", "Continue Watching for Shrivu")
- A `genre` or `collection` backing it (genre/83, genre/34399, my-list, continue-watching)
- An ordered array of `Video` references with tracking context

The tracking context on each title link encodes position:
```
tctx=1,0,,,,,,,,,Video:80232398,
       ^ ^
       | └─ position in row
       └─── row index
```

## Named Internal Systems

| System | Full Name / Purpose | Evidence |
|---|---|---|
| **Akira** | Web UI SPA framework | `x-netflix.context.ui-flavor: akira`, `x-netflix.clienttype: akira` |
| **Hawkins** | Design system | `x-netflix.context.hawkins-version: 5.13.0`, font CDN path includes `hawkins/5.13.0/` |
| **Cadmium** | Web video player | `cadmium-playercore-6.0055.377.911.js`, `/cadmium/licensedmanifest/` |
| **Shakti** | Legacy member API (Falcor-based) | `/shakti/mre/pathEvaluator` in original_path param |
| **Falcor** | Data-fetching library (JSON Graph) | `falcor_server=0.1.0` param, path-based query format |
| **MSL** | Message Security Layer (E2E encryption) | `Content-Encoding: msl_v1`, `/msl_v1/nrdjs/` path |
| **Ichnaea** | Event logging / analytics platform | `x-netflix.ichnaea.request.type: IchnaeaRequest` header |
| **FTL** | Faster Than Light (network probing) | `/api/ftl/probe`, `x-ftl-probe-data` header |
| **Monet** | Ad tech orchestration | `ae.nflximg.net/monet/scripts/` iframe paths |
| **Open Connect** | Netflix's ISP-embedded CDN | `oca.nflxvideo.net`, `nflxso.net` domains |
| **Passport** | Identity / profile resolution | `x-netflix-passport.fromorigin.profileguid` header |
| **ALE** | Authentication token provisioning | `reqName=aleProvision` |
| **BOB** | "Back of Billboard" (title details) | `hasVideoMerchInBob=true` param |
| **JAW** | Expandable title detail panel | `hasVideoMerchInJaw=true` param |
| **Lolomo** | "List of Lists of Movies" (browse layout) | `CLCSInterstitialLolomo` GraphQL operation |
| **CLCS** | Content Lifecycle States | `CLCSInterstitialLolomo`, `x-netflix.request.clcs.bucket` |
| **NMHP** | Netflix Member Homepage | Landing page framework name |
| **NRD** | Netflix Ready Device (platform abstraction) | `/nrdjs/` in MSL paths |
| **Pinot** | Search / discovery rendering engine | `PinotDefaultQuerySearchPage`, `PinotGallerySection` GraphQL types |

## What You'd Need to Build This

Based on the captured architecture, here's the minimum viable set of systems:

### Core Backend Services
1. **Auth Service** -- session management, profile switching, device tracking (ESN-like)
2. **Catalog Service** -- title metadata, cast, genres, seasons/episodes, content advisories
3. **Recommendation Engine** -- personalized Lolomo rows, "Gems for You", "Because You Watched"
4. **Playback Service** -- DRM manifest generation, stream URL signing, ABR manifest
5. **Continue Watching Service** -- bookmark/progress tracking per profile per title
6. **My List Service** -- user playlist CRUD
7. **Search Service** -- full-text search across catalog

### Content Delivery
8. **Video CDN** -- byte-range HTTP serving, signed URLs with TTL, multi-bitrate transcoding
9. **Image API** -- on-the-fly image resizing/cropping (Netflix's `/dnm/api/v6/` serves artwork at different crops and resolutions via URL-encoded params)
10. **Subtitle Service** -- TTML/WebVTT generation per locale per title

### DRM (if needed)
11. **License Server** -- Widevine/FairPlay/PlayReady license provisioning
12. **Key Management** -- encryption key rotation, device authentication

### Client
13. **SPA Shell** -- server-rendered initial HTML + client-side hydration (React)
14. **Video Player** -- adaptive streaming, DRM integration, subtitle overlay, Chromecast
15. **Network Prober** -- CDN selection via latency racing (FTL-equivalent)

### Observability
16. **Event Ingestion** -- high-throughput event logging (Ichnaea-equivalent)
17. **CDN Health** -- FTL-style probing to monitor OCA/CDN health

### Infrastructure
- **API Gateway** -- Envoy proxy with B3 distributed tracing
- **Multi-region deployment** -- at minimum us-west-2, with CDN PoPs
- **Cookie-based auth** -- HttpOnly, Secure, layered TTLs
- **Persisted GraphQL queries** -- query registry with version management

## Non-Obvious Implementation Details

**Video prefetch on browse.** Netflix prefetches the DRM manifest + first few video segments of the billboard title before you click play. That's why playback starts instantly. The `reqName=prefetch/licensedManifest` confirms this is intentional.

**Subtitle format.** Netflix uses TTML (Timed Text Markup Language) with their own namespace extensions (`nttm:` for Netflix metadata), not the simpler WebVTT format. Tick-rate of 10M/sec gives sub-millisecond precision.

**Dual-player subtitle tracks.** The OCA serves subtitles as separate XML documents, not embedded in the video stream. This enables instant language switching without re-buffering.

**Signed video URLs expire in ~12 hours.** The `e=` parameter on OCA URLs is a Unix timestamp ~12h in the future. This prevents hotlinking while allowing reasonable session duration.

**Cloud gaming detection.** The Shakti API checks `["usp","cloudGames","hasMerchedBetaMessage"]` -- Netflix is actively merchandising cloud gaming to users.

**Chromecast is first-class.** `cast_sender.js` loads on every browse page, not lazy-loaded. Casting is expected behavior.

**Two tracking contexts on browse.** The ad tech system passes `membership_status: "CURRENT_MEMBER"` (vs `"ANONYMOUS"` on landing) to differentiate tracking behavior for members vs prospects.

**The B3 trace header.** Netflix uses Zipkin-style B3 distributed tracing across all services. Every response includes `x-b3-traceid` for cross-service request correlation.

**No service worker.** Despite being an SPA, Netflix doesn't use a service worker on web. Offline support is handled natively on mobile/TV apps. The only service worker is Google's conversion tracking worker in the ad iframe.

**OCA failover is seamless.** During the session, the player connected to three different OCA nodes (`c345-sjc002-ix`, `c310-sjc002-ix`, `c314-sjc002-ix`) -- all at the same San Jose IX peering point but different physical servers. The player switches between them transparently, likely based on load or segment availability.

**FTL probes run in pulses.** The probe system fires 3 pulses with delays of `[0, 2000, 70000]` milliseconds. Pulse 1 is immediate, pulse 2 is 2 seconds later, pulse 3 is 70 seconds later. This gives both an instant latency reading and a background health check.

**Search uses capability negotiation.** The client declares what entity types and layout treatments it can render, and the server only returns matching content. This is how they ship games, collections, and new content types without breaking older clients.

**Hover previews prefetch entire rows.** When you hover one title, Netflix fetches `MiniModalQuery` data for every title in that row simultaneously. By the time you move to the next card, its preview clip URL and metadata are already cached.

**Search results have TTLs.** Every search response includes an `expires` timestamp (~8 hours). If you return to the same search, the client knows whether to use cached results or refetch.

**Multiple artwork variants per title.** Each title has 6+ image variants: `boxart` (low-res), `boxartHighRes`, `storyArt` (16:9 hero), `titleLogoBranded` (logo with N badge), `titleLogoUnbranded` (clean logo), `brandLogoSmall` (tiny N icon). The image API serves these at different crops/resolutions via the same `/dnm/api/v6/` endpoint with different path prefixes for different rendering contexts.

**Every image URL is signed.** Image URLs on Open Connect contain a `?r=` parameter that appears to be a short signature/cache-buster. Different images for the same title have different `r=` values.

**The "Collection" entity type.** Search can return `Collection:81137441` ("Breaking Bad Collection") as a first-class entity -- not just individual titles. This lets Netflix group related titles (a show + its movie spinoff + behind-the-scenes doc) into a single searchable unit.
