# Steam Deck: FSR 4 Lite

OptiScaler v10 reaches FSR 4 on RDNA 2 through two INI keys and a driver DLL.
The plugin writes both at install time and ships the DLL, so there is nothing to
download and no modified game DLL to install.

## What is bundled

`bin/OptiScaler-10.0.0-pre1.7z` contains the OptiScaler v10 runtime plus the two
driver FSR 4 libraries it loads from `<game>/OptiScaler/`:

| File | Purpose |
| --- | --- |
| `amdxcffx64.dll` | AMD driver FSR library (FP8 / INT8 models) |
| `amdvkffx64.dll` | Vulkan driver FSR library — the only place the **INT8 Lite** model exists |

`OptiScaler/amd_fidelityfx_upscaler_dx12.dll` is still the OptiScaler-bundled SDK
upscaler (4.1.1). Setup identifies it by its bytes, not its version string, so
the community 4.1.1b build and the bundled one are told apart correctly.

## Settings

Every install writes this preset (Basic → **FSR 4 Lite — Steam Deck** applies the
same values again if you change them):

```ini
[Upscalers]
Dx12Upscaler=ffx          ; FSR 3.X/4 FidelityFX backend on DX12
Dx11Upscaler=ffx_12       ; same backend through DX11on12
VulkanUpscaler=ffx_12

[FSR]
Fsr4GpuSupport=4          ; INT8 — "can enable FSR 4 on unsupported GPUs"
Fsr4Model=3               ; INT8 Lite, the smaller model meant for APUs
UpscalerIndex=0           ; ask for FSR 4, not FSR 3.1
Fsr4Preset=auto
```

`v10` renamed the DX12 backend from `fsr31` to `ffx`; the DX11/Vulkan interop
variants are `ffx_12`. The old keys `Fsr4Update` and `Fsr4ForceEnableInt8` no
longer exist.

Both `Fsr4GpuSupport` and `Fsr4Model` can be changed in OptiScaler's own overlay
while the game runs, without restarting it. `Fsr4Model=3` only works because the
Vulkan driver DLL is present — that is why the payload includes it.

## Verification

Launch the game and use a supported upscaler input (the Cyberpunk setup tested
here uses XeSS). Turn on OptiScaler's watermark and check for **`FSR4`**. Plain
`FSR3` means the driver fell back — usually `Fsr4GpuSupport` or `Fsr4Model` was
reset, or the driver DLL is missing. Reinstall the plugin to put both back.

The watermark identifies the model actually running; Setup only identifies which
upscaler DLL file is in the folder.

## Switching model or turning it off

- **FSR 4 Lite — Steam Deck** — INT8 Lite (`Fsr4GpuSupport=4`, `Fsr4Model=3`), for
  any GPU. This is what a Deck uses.
- **FSR 4** — clear the override and let OptiScaler's own GPU detection decide
  (`Fsr4GpuSupport=auto`, `Fsr4Model=auto`). For RDNA 3 and RDNA 4.
- **FSR 3.X** — same backend with `Fsr4GpuSupport=0` (no override) and
  `UpscalerIndex=1` (FSR 3.1.5). The safe choice if FSR 4 misbehaves.

All of these write the INI; they apply on the next launch. If you want to change
the model mid-game, use OptiScaler's overlay (`Fsr4Model` / `Fsr4GpuSupport`).

This is experimental support for a GPU AMD does not officially cover. Evaluate
motion/ghosting, image quality and base frame rate in the same scene before and
after. It does not enable FSR 4 frame generation; you can keep FSR 3 frame
generation with FSR 4 upscaling, and should test stability separately.

## Live control

The panel's live controls go through the plugin's own ASI, which is built from
`asi/` against the same OptiScaler source the bundled release is built from —
v10 here. It is compiled rather than shipped pointed at a fixed version on
purpose: `asi/live.cpp` mirrors OptiScaler's in-memory `Config` and `State` and
validates every offset it computes before writing, so a release it does not
recognise leaves live control reporting itself unavailable instead of writing
into the wrong object.

What the panel can change without a restart:

- frame generation on and off, the FidelityFX FG version, and the frame rate
  readout (rendered and presented);
- the upscaler, through OptiScaler's own backend switch;
- the FSR 4 switches — `Fsr4GpuSupport` and `Fsr4Model` — which v10 reads while
  the driver FSR model is being chosen.

Settings that OptiScaler reads once, when a feature or swapchain is created, are
under **Needs a restart**: they are written to `OptiScaler.ini` and apply on the
next launch.

## Upgrading, repairing, uninstalling

- Installing over a 0.9.4 install removes the old layout (root-level
  `amd_fidelityfx_*.dll`, `fakenvapi.*`, `D3D12_Optiscaler/`, the old live ASI)
  and restores any file that had been displaced instead of deleting it. Your
  `OptiScaler.ini`, REFramework, PDPerfPlugin and launch options are kept.
- Setup can name the upscaler build in the folder and put the bundled 4.1.1 back
  if a community build was swapped in.
- Uninstall restores the game's original backed-up files and removes everything
  the plugin placed, including the driver DLLs.

Avoid modified DLLs in games whose anti-cheat forbids them. The bundled driver
DLLs are AMD's own, redistributed unchanged.
