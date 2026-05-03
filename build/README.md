# build/ — electron-builder buildResources

이 디렉터리는 electron-builder 가 packaging 시 읽는 리소스를 담습니다.

## 파일 목록

| 파일 | 용도 | 상태 |
|------|------|------|
| `entitlements.mac.plist` | macOS hardened runtime entitlements | ✅ 완료 |
| `icon.svg` | 아이콘 source-of-truth | ✅ placeholder |
| `icon.icns` | macOS 앱 아이콘 (1024×1024 multi-resolution) | ⏳ 미생성 |
| `icon.ico` | Windows 설치 프로그램 아이콘 | ⏳ 미생성 |
| `icon.png` | Linux .desktop 아이콘 (512×512) | ⏳ 미생성 |
| `background.png` | DMG 배경 (선택) | ⏳ 미생성 |

## 아이콘 생성 (release 전)

`icon.svg` 가 source. 다른 포맷은 다음 명령으로 생성:

### macOS (.icns)

```bash
# 1. SVG → 1024 PNG
rsvg-convert -w 1024 -h 1024 icon.svg -o icon-1024.png

# 2. PNG → ICNS (iconutil은 macOS 내장)
mkdir icon.iconset
sips -z 16 16     icon-1024.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon-1024.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon-1024.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon-1024.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon-1024.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon-1024.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon-1024.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon-1024.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon-1024.png --out icon.iconset/icon_512x512.png
cp icon-1024.png  icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
```

### Windows (.ico)

```bash
# ImageMagick
magick convert icon.svg -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

### Linux (.png 512×512)

```bash
rsvg-convert -w 512 -h 512 icon.svg -o icon.png
```

## 임시 fallback

위 파일 미생성 시 electron-builder 가 기본 Electron 아이콘 사용.
release 자체는 가능하지만 unbranded (Phase 4 디자이너 작업 대기).
