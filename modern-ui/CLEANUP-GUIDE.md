# 🧹 Cleanup Guide

## ✅ **Keep These (Essential)**

### **Directories:**
- `src/` - Your source code
- `electron/` - Electron main process
- `public/` - Public assets (logo, etc.)
- `resources/` - App resources (icons)
- `node_modules/` - Dependencies (auto-generated)
- `dist/` - Production build (auto-generated)
- `dist-electron/` - Electron build (auto-generated)

### **Files:**
- `package.json` - Dependencies and scripts
- `package-lock.json` - Locked dependency versions
- `tsconfig.json` - TypeScript config
- `vite.config.ts` - Build config
- `tailwind.config.js` - Styling config
- `index.html` - HTML template
- `.gitignore` - Git ignore rules
- `.npmrc` - NPM config
- `README.md` - Main documentation
- `start-clean.bat` - Startup script (no DevTools)
- `start-dev.bat` - Startup script (with DevTools)

## ❌ **Can Delete (Failed Builds)**

- `build-output/` - Failed build attempt
- `dist-app/` - Failed build attempt  
- `release/` - Failed build attempt

## 📚 **Optional Documentation (Can Delete)**

- `QUICKSTART.md`
- `SETUP.md`
- `LINUX.md`
- `WHATS-NEW.md`
- `package-scripts.json`
- `components.json`

---

## 🗑️ **Quick Clean Command**

To remove all failed builds:
```powershell
Remove-Item -Recurse -Force build-output, dist-app, release -ErrorAction SilentlyContinue
```

To remove optional docs:
```powershell
Remove-Item -Force QUICKSTART.md, SETUP.md, LINUX.md, WHATS-NEW.md, package-scripts.json, components.json -ErrorAction SilentlyContinue
```


