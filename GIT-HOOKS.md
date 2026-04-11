# 🪝 Git Hooks Guide - FreelanceFlow

This project uses **Husky** and **lint-staged** to enforce code quality through automated git hooks.

## 🎯 **What Hooks Are Configured**

### **Pre-commit Hook** 🔍
**Runs before every commit** - Ensures code quality

**What it checks:**
- ✅ **Prettier formatting** on TypeScript/JavaScript files
- ✅ **ESLint rules** with auto-fixing
- ✅ **Related tests** for changed TypeScript files
- ✅ **File formatting** for JSON, Markdown, YAML files

**Example:**
```bash
git add src/auth/auth.service.ts
git commit -m "feat: add JWT authentication"

# Output:
🔍 FreelanceFlow Pre-commit Hook Running...
✅ Running tasks for staged files...
  ✅ prettier --write [1 file]
  ✅ eslint --fix [1 file] 
  ✅ npm run test:staged [1 file]
✅ All checks passed!
```

### **Commit Message Hook** 📝
**Runs on commit** - Enforces conventional commit format

**Required format:**
```
<type>[optional scope]: <description>

feat: add user authentication
fix(auth): resolve JWT token expiration  
docs: update API documentation
refactor(services): extract common validation logic
```

**Valid types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`

### **Pre-push Hook** 🚀
**Runs before pushing** - Final quality gate

**What it checks:**
- ✅ **Full test suite** must pass
- ✅ **Application build** must succeed
- ✅ **No compilation errors**

## 🛠️ **How to Use**

### **Normal Development Workflow**
```bash
# 1. Make changes
vim src/auth/auth.service.ts

# 2. Stage changes
git add .

# 3. Commit (hooks run automatically)
git commit -m "feat(auth): implement JWT token refresh"
# ✅ Pre-commit hook runs: format + lint + test
# ✅ Commit message hook validates format

# 4. Push (final checks run)
git push origin feature/jwt-refresh
# ✅ Pre-push hook runs: full test + build
```

### **What Happens When Hooks Fail**

**❌ Pre-commit failure:**
```bash
git commit -m "feat: add auth"

🔍 FreelanceFlow Pre-commit Hook Running...
❌ ESLint errors found:
  src/auth/auth.service.ts:15:1 - Unexpected console.log
❌ Commit aborted - fix errors and try again
```

**❌ Commit message failure:**
```bash
git commit -m "added some stuff"

❌ Invalid commit message format!
✅ Expected format: <type>[optional scope]: <description>
📝 Examples:
  feat: add user authentication
  fix(auth): resolve JWT token expiration
```

**❌ Pre-push failure:**
```bash
git push origin main

🚀 FreelanceFlow Pre-push Hook Running...
🧪 Running full test suite...
❌ Tests failed! Push aborted.
  AuthService › should validate JWT tokens
    Expected: true
    Received: false
```

## 🔧 **Bypass Hooks (Emergency Only)**

**⚠️ Use sparingly - only for emergencies!**

```bash
# Skip pre-commit hook
git commit -m "hotfix: critical security patch" --no-verify

# Skip pre-push hook
git push --no-verify
```

## 🎛️ **Customizing Hooks**

### **Modify Pre-commit Checks**
Edit `package.json`:
```json
{
  "lint-staged": {
    "*.{ts,js}": [
      "prettier --write",
      "eslint --fix", 
      "git add"
    ]
  }
}
```

### **Modify ESLint Rules**
Edit `.eslintrc.json`:
```json
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

### **Add New Hooks**
```bash
# Create new hook
echo '#!/bin/sh\necho "Custom hook"' > .husky/pre-merge-commit
chmod +x .husky/pre-merge-commit
```

## 🏆 **Benefits for FreelanceFlow**

1. **🛡️ Code Quality**: Prevents bad code from entering repo
2. **🤝 Team Consistency**: Everyone follows same standards
3. **⚡ Fast Feedback**: Catch issues before CI/CD pipeline
4. **📈 Productivity**: Auto-fix common issues
5. **🔍 Documentation**: Conventional commits improve history

## 🔍 **Troubleshooting**

### **Hook doesn't run**
```bash
# Reinstall husky
npm run prepare
```

### **Permission errors**
```bash
# Make hooks executable
chmod +x .husky/*
```

### **Skip specific files**
```bash
# Add to .eslintignore
echo "dist/**" >> .eslintignore
```

---

**🎯 Remember**: Hooks are your safety net, not obstacles! They help maintain the high code quality standards expected in a senior-level SaaS project like FreelanceFlow.