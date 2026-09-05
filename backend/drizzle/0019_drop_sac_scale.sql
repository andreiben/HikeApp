ALTER TABLE routes DROP COLUMN sac_scale;
UPDATE routes SET difficulty = 'expert' WHERE elevation_gain_m >= 1200 AND difficulty = 'hard';
