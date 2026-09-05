ALTER TABLE user_profiles DROP COLUMN max_comfort_duration_h;
ALTER TABLE user_profiles DROP COLUMN max_comfort_elevation_gain_m;
ALTER TABLE user_profiles ADD COLUMN height_cm INTEGER;
ALTER TABLE user_profiles ADD COLUMN weight_kg INTEGER;
ALTER TABLE user_profiles ADD COLUMN age INTEGER;
