#!/bin/bash
# ============================================================================
# Export Current Supabase Schema
# ============================================================================
# This script exports your current Supabase schema for comparison
# Requires: Supabase CLI installed and project linked
# ============================================================================

set -e

echo "🔍 Exporting current Supabase schema..."

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it first:"
    echo "   brew install supabase/tap/supabase"
    exit 1
fi

# Check if project is linked
if [ ! -f ".supabase/config.toml" ]; then
    echo "❌ Supabase project not linked. Run:"
    echo "   supabase link --project-ref YOUR_PROJECT_REF"
    exit 1
fi

# Export current schema
echo "📥 Pulling schema from Supabase..."
supabase db pull --schema public

# Save to a comparison file
EXPORT_FILE="supabase/migrations/current_schema_export.sql"
echo "💾 Saving to $EXPORT_FILE"

# Find the latest migration file created by pull
LATEST_MIGRATION=$(ls -t supabase/migrations/*.sql 2>/dev/null | head -n 1)

if [ -n "$LATEST_MIGRATION" ]; then
    cp "$LATEST_MIGRATION" "$EXPORT_FILE"
    echo "✅ Schema exported successfully!"
    echo ""
    echo "📊 Compare with consolidated schema:"
    echo "   diff supabase/schema.sql $EXPORT_FILE"
    echo ""
    echo "🧹 Clean up when done:"
    echo "   rm $EXPORT_FILE"
    echo "   rm $LATEST_MIGRATION"
else
    echo "⚠️  No migration file created. Schema might be empty or unchanged."
fi
