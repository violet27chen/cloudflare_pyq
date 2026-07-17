-- 给 site_settings 增加 colors_json 列（主题颜色 JSON）。
-- 幂等：列已存在时 ALTER 会报错，故先判断。
ALTER TABLE site_settings ADD COLUMN colors_json TEXT NOT NULL DEFAULT '{}';
