# build/ — electron-builder buildResources

이 디렉터리는 electron-builder 가 packaging 시 읽는 리소스를 담습니다.

## 파일 목록

| 파일 | 용도 | 상태 |
|------|------|------|
| `entitlements.mac.plist` | macOS hardened runtime entitlements | 완료 |
| `icon.svg` | 아이콘 source-of-truth | 완료 |
| `icon.png` | Linux .desktop + macOS source (1024×1024) | 자동 생성 |
| `icon.ico` | Windows installer 아이콘 (multi-size) | 자동 생성 |
| `icon.icns` | macOS 앱 아이콘 (electron-builder 자동 변환) | 빌드 시 생성 |
| `background.png` | DMG 배경 (선택) | 미생성 |

## 아이콘 생성

`icon.svg` 가 source-of-truth. PNG + ICO 는 cross-platform Node script 로 생성:

```bash
npm run icons:generate
# 또는 직접
node scripts/generate-icons.cjs
```

이 명령은 다음을 생성:
- `build/icon.png` — 1024×1024 (Linux + macOS source)
- `build/icon.ico` — multi-size (16/32/48/64/128/256, Windows installer)

`icon.icns` (macOS) 는 별도 생성 불필요 — electron-builder 가 빌드 시 `build/icon.png`
로부터 자동 변환. 따라서 macOS-only 도구 (iconutil, sips) 없이도 모든 OS 에서
완전한 platform 아이콘 생성 가능.

## 워크플로우

1. SVG 디자인 수정 (`build/icon.svg`)
2. `npm run icons:generate` 실행
3. 생성된 `icon.png` + `icon.ico` 를 commit
4. CI/local 빌드 시 electron-builder 가 platform 별 적절한 파일 사용

## 의존성

`scripts/generate-icons.cjs` 는 다음 npm 패키지 사용:
- `@resvg/resvg-js` — SVG 렌더링 (cross-platform, native bindings 포함)
- `png-to-ico` — Multi-size ICO 컨테이너 빌드
