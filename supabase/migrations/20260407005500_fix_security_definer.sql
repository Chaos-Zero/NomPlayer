-- Supabase Migration: Fix Security Definer Warning for track_stats_summary
ALTER VIEW "public"."track_stats_summary" SET (security_invoker = true);
