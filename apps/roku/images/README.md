# StreamShōgun Roku App — Image Assets

## Required images for sideloading and store submission.

## Place final assets in this directory.

### Required Asset Sizes

| File                 | Size      | Format | Purpose                      |
| -------------------- | --------- | ------ | ---------------------------- |
| `icon_focus_fhd.png` | 540×405   | PNG    | Channel icon (focused state) |
| `icon_focus_hd.png`  | 290×218   | PNG    | HD channel icon              |
| `icon_focus_sd.png`  | 214×144   | PNG    | SD channel icon              |
| `icon_side_hd.png`   | 336×210   | PNG    | HD side/unfocused icon       |
| `icon_side_sd.png`   | 248×140   | PNG    | SD side/unfocused icon       |
| `splash_fhd.jpg`     | 1920×1080 | JPG    | FHD splash screen            |
| `splash_hd.jpg`      | 1280×720  | JPG    | HD splash screen             |
| `splash_sd.jpg`      | 720×480   | JPG    | SD splash screen             |

### Design Guidelines

- **Background color**: `#0c0c0e` (match app background)
- **Accent color**: `#7c5cfc` (StreamShōgun purple)
- **Text color**: `#f4f4f5`
- **Font**: Use the StreamShōgun logotype or a clean sans-serif
- **Icon**: Feature the StreamShōgun logo centered on `#0c0c0e` background
- **Splash**: Full-screen with logo centered, optionally with tagline "Personal Playlist Player"

### Screenshot Assets (for store submission)

Capture 3-6 screenshots at 1920×1080:

- See `docs/STORE_LISTING.md` for screenshot guidance
- Place screenshots in `images/screenshots/` subfolder

### Notes

- The manifest references these paths:
  - `mm_icon_focus_fhd=pkg:/images/icon_focus_fhd.png`
  - `mm_icon_focus_hd=pkg:/images/icon_focus_hd.png`
  - `mm_icon_focus_sd=pkg:/images/icon_focus_sd.png`
  - `mm_icon_side_hd=pkg:/images/icon_side_hd.png`
  - `mm_icon_side_sd=pkg:/images/icon_side_sd.png`
  - `splash_screen_fhd=pkg:/images/splash_fhd.jpg`
  - `splash_screen_hd=pkg:/images/splash_hd.jpg`
  - `splash_screen_sd=pkg:/images/splash_sd.jpg`
- Run `apps/roku/scripts/create-assets.ps1` to regenerate the current branded placeholder set.
