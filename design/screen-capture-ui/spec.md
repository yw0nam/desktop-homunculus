# DH-F4: Screen Capture UI — Component Spec

> Design Agent artifact · Variant A (Panel Above ControlBar) · 2026-03-31

---

## Overview

ControlBar에 캡쳐 toggle(📷)을 추가하고, toggle ON 시 ControlBar 위에 Capture Panel이 슬라이드 업으로 펼쳐집니다.
기존 `App.tsx`의 `anyPanelOpen` 패턴과 동일하게 동작합니다.

---

## Props

### `CapturePanel`

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `'fullscreen' \| 'window'` | `'fullscreen'` | 현재 캡쳐 모드 |
| `windows` | `{ id: string; title: string }[]` | `[]` | `listWindows()` RPC 결과 |
| `selectedWindowId` | `string \| null` | `null` | 선택된 윈도우 ID |
| `previewBase64` | `string \| null` | `null` | 미리보기 이미지 (base64) |
| `onModeChange` | `(mode: 'fullscreen' \| 'window') => void` | — | 모드 변경 콜백 |
| `onWindowSelect` | `(id: string) => void` | — | 윈도우 선택 콜백 |

### `ControlBar` (확장)

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `onToggleCapture` | `() => void` | — | 기존 props에 추가 |
| `captureActive` | `boolean` | `false` | 📷 아이콘 활성화 상태 |

---

## Signals

| Signal name | Type | Description |
|-------------|------|-------------|
| `dm-capture-enabled` | `Signal<boolean>` | 캡쳐 기능 ON/OFF |
| `dm-capture-mode` | `Signal<'fullscreen' \| 'window'>` | 현재 캡쳐 모드 |
| `dm-capture-window-list` | `Signal<{ id: string; title: string }[]>` | `listWindows()` 결과 캐시 |
| `dm-capture-selected-window` | `Signal<string \| null>` | 선택된 윈도우 ID |
| `dm-capture-preview` | `Signal<string \| null>` | 캡쳐 결과 base64 이미지 |

Signal 네이밍 컨벤션: `dm-{feature}-{name}` (desktopmate-bridge 접두사)

---

## State Machine

```
captureOff
  │  [📷 click]
  ▼
captureOn:fullscreen ──────── [🪟 Window click] ──────────────►  captureOn:window
  │  [🖥 Fullscreen click]  ◄─ [🖥 Fullscreen click]              │
  │                                                                │ [dropdown select]
  │  [📷 click]                  [📷 click]                       ▼
  ▼                              │                   captureOn:window:selected
captureOff ◄───────────────────────────────────────────────────────┘
                                                     [📷 click]
```

상태 전이 규칙:
- `captureOff` → `captureOn:fullscreen` (기본 진입 모드)
- 모드 전환 시 선택된 윈도우는 유지 (`selectedWindowId` 보존)
- Panel 닫기 시(`📷 click`) `dm-capture-enabled = false`, 나머지 signal 값 유지

---

## RPC Interface (DH-F3 Service Layer 의존)

```typescript
// DH-F3에서 구현 — 아직 미구현
listWindows(): Promise<{ id: string; title: string }[]>
captureScreen(): Promise<string>           // base64 PNG
captureWindow(id: string): Promise<string> // base64 PNG
```

Capture Panel은 `dm-capture-enabled` signal이 true가 될 때 `listWindows()`를 호출합니다.

---

## Visual Design

- Glassmorphism: `bg-black/30 backdrop-blur-sm border border-white/10`
- Panel animation: `transition: max-height 0.18s ease, opacity 0.18s ease`
- 📷 active state: `text-blue-400 text-shadow: 0 0 8px rgba(96,165,250,0.55)`
- Mode button active: `border-blue-400/60 bg-blue-500/20 text-blue-300`
- Window dropdown: `bg-black/95 backdrop-blur-sm border-white/10 shadow-xl z-50`
- Preview area: `h-12 border-white/10 bg-white/5` (base64 image가 있으면 `<img>` 렌더)

---

## Acceptance Criteria

- [ ] **AC-1 Toggle**: ControlBar의 📷 버튼 클릭 시 Capture Panel이 표시/숨김 전환된다
- [ ] **AC-2 Icon glow**: 캡쳐 활성화 시 📷 아이콘에 파란 glow가 적용된다
- [ ] **AC-3 Fullscreen mode**: "🖥 Fullscreen" 버튼 선택 시 윈도우 selector가 숨겨진다
- [ ] **AC-4 Window mode**: "🪟 Window" 버튼 선택 시 윈도우 selector가 표시되고 `listWindows()`가 호출된다
- [ ] **AC-5 Window list**: 드롭다운에 `listWindows()` 결과가 표시된다
- [ ] **AC-6 Window select**: 윈도우 선택 시 `dm-capture-selected-window` signal이 업데이트된다
- [ ] **AC-7 Preview**: 모드 선택 후 `captureScreen()` / `captureWindow(id)` 결과가 preview 영역에 표시된다
- [ ] **AC-8 Off cleanup**: 📷 toggle OFF 시 `dm-capture-enabled = false`, Panel 닫힘

---

## Implementation Notes

- `App.tsx`에서 `showCapture` state 추가, `anyPanelOpen` 조건에 포함
- `CapturePanel`은 별도 컴포넌트 파일: `ui/src/components/CapturePanel.tsx`
- `useSignals.ts`에 capture signal 구독 추가
- Window list 중복 호출 방지: `dm-capture-enabled` true 전환 시 한 번만 호출
- E2E requires CEF + Bevy runtime — see `screen-capture-ui.test.ts`
