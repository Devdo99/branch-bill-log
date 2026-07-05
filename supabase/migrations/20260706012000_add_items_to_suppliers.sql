-- Migration: Add items column to suppliers table to store items sold by the supplier
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS items text;
