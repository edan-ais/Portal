# Quick Start Guide

## ⚡ Complete Database Setup in 2 Minutes

### What You Need to Do

Your Supabase database is **99% ready**. Just one quick step needed:

1. **Open this link:** https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce/sql
2. **Copy all text** from `setup-database.sql` file in your project
3. **Paste into SQL Editor** and click **Run**
4. **Verify:** Run `npm run test-db` - you should see "ALL TESTS PASSED"

That's it! 🎉

---

## What's Already Working

✅ Database connected
✅ Storage bucket ready
✅ 11 out of 12 tables created
✅ RLS policies configured
✅ Project builds successfully

## What Gets Fixed

The SQL script creates the missing `files` table, which is needed for:
- Labels tab file uploads
- File management features
- Archive functionality
- Trash/restore features

---

## Quick Commands

```bash
# Test database setup
npm run test-db

# Start development server
npm run dev

# Build for production
npm run build
```

---

## Files Created

📄 **setup-database.sql** - Complete SQL migration script
📄 **SETUP_INSTRUCTIONS.md** - Detailed setup guide
📄 **test-db.js** - Enhanced database testing script (updated)

---

## Support

Having issues? Run the test to see what's wrong:

```bash
npm run test-db
```

The test will show you exactly what needs to be fixed.

---

## Your Project Info

**Supabase URL:** https://hxpbjtimdctvhxqulnce.supabase.co
**SQL Editor:** https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce/sql
**Dashboard:** https://supabase.com/dashboard/project/hxpbjtimdctvhxqulnce
