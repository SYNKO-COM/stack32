# Codec Pro (Stack32 UI font)

The product UI is designed around **Codec Pro** (Fontfabric).

## Activate

1. Add your licensed `.woff2` files here:
   - `CodecPro-Regular.woff2`
   - `CodecPro-Medium.woff2`
   - `CodecPro-Bold.woff2`
   - `CodecPro-ExtraBold.woff2` (optional)

2. Add this block to `apps/web/app/globals.css` (replace the Codec Pro comment):

```css
@font-face {
  font-family: "Codec Pro";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/codec-pro/CodecPro-Regular.woff2") format("woff2");
}
@font-face {
  font-family: "Codec Pro";
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/codec-pro/CodecPro-Medium.woff2") format("woff2");
}
@font-face {
  font-family: "Codec Pro";
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/codec-pro/CodecPro-Bold.woff2") format("woff2");
}
@font-face {
  font-family: "Codec Pro";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/codec-pro/CodecPro-ExtraBold.woff2") format("woff2");
}
```

Until then, **Manrope** is used as a geometric sans fallback.

**Logo wordmark** uses the official PNG assets (Sanchez is baked into those files). The Sanchez webfont is still loaded for any rare text branded moments (`.font-brand`).
