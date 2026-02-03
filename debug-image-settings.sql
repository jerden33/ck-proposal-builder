-- Debug Image Settings
-- Run this in Supabase SQL Editor to check image settings

-- Check all image-related settings
SELECT
  key,
  value,
  updated_at
FROM app_settings
WHERE key IN ('hero_image', 'product_images', 'feature_icons')
ORDER BY key;

-- Check if hero_image exists and what its value is
SELECT
  key,
  value,
  LENGTH(value) as value_length,
  updated_at
FROM app_settings
WHERE key = 'hero_image';

-- Check product_images
SELECT
  key,
  value,
  updated_at
FROM app_settings
WHERE key = 'product_images';

-- If hero_image doesn't exist, insert it
-- INSERT INTO app_settings (key, value, updated_at)
-- VALUES ('hero_image', 'null', NOW())
-- ON CONFLICT (key) DO NOTHING;
