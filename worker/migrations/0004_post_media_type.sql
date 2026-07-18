-- 0004: 让动态支持混合媒体（图片 / 动图 / 视频 / 实况）。
-- 给 post_images 增加 media_type 与 poster_url 两列。
-- 旧数据 media_type 默认 'image'，poster_url 默认 ''，向后兼容。

ALTER TABLE post_images
  ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image'
    CHECK(media_type IN ('image','gif','video','live'));

ALTER TABLE post_images
  ADD COLUMN poster_url TEXT NOT NULL DEFAULT '';
