# Geist 字体（自托管）

本项目**不外链 Google Fonts**（生产环境规范）。Geist 变量字体需手动放置。

## 步骤

1. 从官方仓库下载两个文件：
   - https://github.com/vercel/geist-font/raw/main/packages/next/src/fonts/Geist-Variable.woff2
   - https://github.com/vercel/geist-font/raw/main/packages/next/src/fonts/GeistMono-Variable.woff2

2. 放到本目录：

```
frontend/public/fonts/
├── Geist-Variable.woff2
└── GeistMono-Variable.woff2
```

`src/styles/global.css` 中的 `@font-face` 已配置 `font-display: swap`，加载前回退到系统字体，无 FOIT。

> 若下载失败，前端会自动回退到 `system-ui / -apple-system / Helvetica Neue`，功能不受影响，仅字形略变。
