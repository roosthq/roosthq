# Kiosk setup (Raspberry Pi wall display)

How to turn a Raspberry Pi + touchscreen into a Roost HQ wall kiosk: full-screen
browser, no login, auto-starts on boot, recovers from crashes on its own.

This is entirely independent of the server setup in [`DEPLOY.md`](./DEPLOY.md) - the
Pi is just a browser pointed at a URL. Nothing kiosk-specific lives on the SD card;
all of it is a link + a token issued by the app. That also means **swapping
hardware later needs a fresh SD card, not a card swap** - see
[Moving to new hardware](#moving-to-new-hardware) below.

## What you need

- **Raspberry Pi 4 (4GB+) or Pi 5.** Either runs this fine - a full-screen
  Chromium tab with a calendar grid, occasional animations, and one open
  Server-Sent-Events connection isn't demanding. Pi 5 is simply snappier
  (faster Chromium compositing/scrolling, quicker recovery from a reload).
  **Don't use anything older (Pi 2/3/Zero)** - see the hardware note below.
- **The right power supply.** Pi 4 wants the official 15W USB-C supply; Pi 5
  wants the official **27W USB-C PD** supply. An old Pi 4 charger on a Pi 5
  will undervolt and cause random crashes/throttling - don't reuse it.
- **Cooling.** Pi 4 can run passive (a heatsink case) for this workload. Pi 5
  runs hot enough under sustained Chromium use that you want the official
  active cooler/case, or expect thermal throttling over hours of uptime.
- **A touchscreen or monitor** (official Pi touchscreen, or any HDMI display -
  touch is nice for the household widgets but not required).
- **A 16GB+ microSD card** (32GB+ if you want headroom for logs/cache).

## 1. Flash the OS

Use **Raspberry Pi Imager** (<https://www.raspberrypi.com/software/>):

1. Choose **Raspberry Pi OS (64-bit)** - the full **"Raspberry Pi OS"** image
   with desktop, not **Lite** (Lite has no GUI, and this needs one to run a
   browser).
2. Pick your Pi 4/5 as the device.
3. In the Imager's **advanced options** (gear icon / Ctrl+Shift+X), set:
   - hostname (e.g. `roost-kitchen`)
   - enable SSH (so you can manage it headless afterward)
   - wifi SSID/password, if not on Ethernet
   - locale/timezone/keyboard layout

   Setting these here skips the first-boot setup wizard entirely.
4. Flash, then boot the Pi with the touchscreen/monitor attached.

## 2. First boot

SSH in (`ssh <user>@roost-kitchen.local`, or whatever hostname you set) and
update:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo reboot
```

Chromium ships preinstalled on Raspberry Pi OS. Confirm the binary name -
it's `chromium` on current (Bookworm+) releases, `chromium-browser` on older
ones:

```bash
which chromium || which chromium-browser
```

Use whichever one exists in the steps below.

## 3. Get the kiosk link

In the app, sign in as the **owner** (or a family manager) on a regular
browser/phone - not the Pi. Everything here lives under one section:
**Settings → Touch displays**.

1. First, optionally create/edit a display (name, calendars, features, theme,
   and - for a split household - which location it's scoped to) in the top
   part of that section. Skip this if the default display is fine.
2. In **Display access** underneath it, pick which display this Pi shows
   (or leave it on the default), then **+ Generate kiosk link**.
3. Copy the URL immediately - **the token is shown only once**. It looks like:

   ```
   https://roost.yourdomain.com/?display=1&token=<long-token>
   ```

4. Note which display config you bound it to (its name), for when you need to
   find it again later in that list.

This link needs no login and works over the internet (through whatever tunnel
your server setup uses) - the Pi never needs a Google account or a password.

## 4. Autostart Chromium in kiosk mode

The most portable way - a `systemd` service - doesn't depend on which desktop
environment/compositor your Raspberry Pi OS version defaults to (this has
changed more than once between releases: LXDE/X11 on older ones, Wayfire or
Labwc/Wayland on current Bookworm+).

Create `/etc/systemd/system/roost-kiosk.service`:

```ini
[Unit]
Description=Roost HQ kiosk
After=graphical.target
Wants=graphical.target

[Service]
User=<your-username>
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/<your-username>/.Xauthority
ExecStartPre=/bin/sleep 5
ExecStart=/usr/bin/chromium \
  --kiosk "https://roost.yourdomain.com/?display=1&token=<long-token>" \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-translate \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000
Restart=always
RestartSec=3

[Install]
WantedBy=graphical.target
```

Notes on those flags:
- `--kiosk` - full screen, no address bar/tabs/nothing touchable outside the page.
- `--disable-session-crashed-bubble` / `--noerrdialogs` - Chromium normally
  asks "restore pages?" after an unclean shutdown (e.g. a power cut); this
  suppresses that so it just loads straight into the kiosk.
- `--autoplay-policy=no-user-gesture-required` - without this, the
  completion/celebration sound effects won't play, since Chromium normally
  blocks audio until a user interacts with the page.
- `Restart=always` - if Chromium itself crashes, systemd relaunches it in a
  few seconds. Combined with the app's own remote-reload (below), this means
  the Pi mostly takes care of itself.
- Swap `chromium` for `chromium-browser` if that's what step 2 found.

Replace `<your-username>` and the URL/token, then enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now roost-kiosk
```

Reboot to confirm it comes up on its own: `sudo reboot`.

## 5. Keep the screen from sleeping

Raspberry Pi OS will blank the screen after inactivity by default - bad for
a wall display. If you're on the X11 desktop (older releases), add to the
same service (or a small autostart script run before Chromium):

```bash
xset s off
xset s noblank
xset -dpms
```

On the newer Wayland-based desktop (Wayfire/Labwc), there's no `xset`
equivalent needed the same way - screen blanking is usually already off by
default for a kiosk-style session. If the screen still sleeps, check
**Raspberry Pi Configuration → Display** for a blanking/screensaver option.

## 6. Rotate the display (wall-mounted portrait, etc.)

Edit `/boot/firmware/config.txt` (this path moved here on Bookworm+; it's
`/boot/config.txt` on older releases) and add, e.g. for 90°:

```
display_rotate=1
```

(`0`=normal, `1`=90°, `2`=180°, `3`=270°.) Reboot after editing. If using the
official touchscreen, touch input rotates automatically with the display.

## 7. If a third-party touchscreen is misaligned

Official Pi touchscreens don't need calibration. A third-party one might:

```bash
sudo apt install xinput-calibrator
xinput_calibrator
```

Follow the on-screen taps; it prints an `xorg.conf.d` snippet to save.

## Recovering a stuck or broken kiosk

Two different problems, two different fixes:

- **Frozen/stuck page, but the link still works** (blank white screen, stuck
  on old data, JS error) - from the app, **Settings → Touch displays**:
  🔄 Reload kiosk on that display's row (or the same icon next to its
  kiosk link in Display access, just below it). This pushes a reload over the connection
  the kiosk already has open - no physical access to the Pi needed. It also
  reloads on its own after `systemctl`'s `Restart=always` if Chromium itself
  crashed.
- **The link itself is dead** (token revoked, or accidentally deleted) - a
  remote reload can't fix this; a kiosk whose link is dead was never
  connected to receive the reload push in the first place. Mint a fresh
  kiosk link from **Display access**, then either:
  - SSH in and edit the `ExecStart` URL in
    `/etc/systemd/system/roost-kiosk.service`, then
    `sudo systemctl daemon-reload && sudo systemctl restart roost-kiosk`, or
  - attach a keyboard temporarily and retype the URL in Chromium
    (`Ctrl+L` still works even in kiosk mode).

## Moving to new hardware

**You cannot move a kiosk to a newer/older Pi by swapping the SD card.**
Different Pi generations use different SoCs (a Pi 2's BCM2836 vs a Pi 4's
BCM2711 vs a Pi 5's BCM2712) with different kernels/boot firmware - an OS
image built for one won't recognize another's hardware. Best case it won't
boot; worst case it hangs on a blank/rainbow screen.

This isn't actually a loss, though - there is nothing on the card worth
keeping *as app state*. All of that (the display config + its token) lives in
the app, not the Pi. But the old Pi's card still holds a few *local* config
choices you already made and would otherwise have to re-derive by trial and
error - worth pulling off before wiping it:

**0. Before wiping the old card**, SSH into the old Pi and check:

- **The kiosk link itself, and any custom Chromium flags.** If you never
  saved the link anywhere else, this is your only remaining copy - the token
  is shown once, at mint time, and never again:
  ```bash
  cat /etc/systemd/system/roost-kiosk.service
  ```
  Grab the whole `ExecStart` line. Reuse the URL/token verbatim on the new
  Pi; just recheck the binary name (`chromium` vs `chromium-browser`) if
  you're jumping OS releases (see step 2 above).
- **Screen rotation**, if the display is mounted rotated:
  ```bash
  grep display_rotate /boot/firmware/config.txt 2>/dev/null || grep display_rotate /boot/config.txt
  ```
- **Touch calibration**, if a third-party (non-official) touchscreen needed
  the `xinput_calibrator` step:
  ```bash
  cat /etc/X11/xorg.conf.d/*calibration*.conf 2>/dev/null
  ```
  Nothing there means you're on the official touchscreen (no calibration
  needed on the new Pi either).
- **Any manual screen-blanking/autostart tweaks** added outside the systemd
  service (the doc's own service doesn't need any, but check for drift):
  ```bash
  cat ~/.config/autostart/*.desktop 2>/dev/null
  ```

Not worth pulling forward: WiFi, hostname, locale, timezone - Imager's
advanced options set those fresh for the new card anyway (step 1 above).

To move to new hardware:

1. Pull the values above off the old Pi first.
2. Flash a fresh card for the new board (steps 1-2 above).
3. Reuse the **existing** kiosk link (no need to mint a new one, unless you
   also want a clean audit trail of which physical device holds which token
   - revoke the old one and mint a fresh one if so).
4. Set up autostart (steps 4-7) on the new Pi, carrying over any
   rotation/calibration/flag values found in step 0.
5. Physically retire the old board - its SD card can be wiped/reused for
   anything else.

## Multiple kiosks

Each physical Pi gets its **own** kiosk link, bound to whichever display
config (calendars/features/theme, and optionally a single location) you want
that Pi to show - e.g. one per house, for a split-location family. See
**Settings → Touch displays** to create additional displays, and mint a
link for each one in Display access there. Revoking one Pi's link never
affects any other.

## Security notes

- A kiosk (display) token is **read-only** - it can view the family's
  calendar/chores/etc. for that display config but never act as a specific
  person until someone unlocks a profile with their PIN on the physical
  screen.
- The short-lived token minted at PIN-unlock (acting as that person) expires
  after 12 hours on its own - no action needed, the kiosk just drops back to
  the profile picker.
- Treat a kiosk link like a password: anyone with the URL can view that
  display's data without signing in. Don't post it publicly; revoke and
  re-mint if you suspect it leaked.
