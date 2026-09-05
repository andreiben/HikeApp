ALTER TABLE risk_assessments ADD COLUMN factors JSONB;
ALTER TABLE risk_assessments ADD COLUMN sub_scores JSONB;
ALTER TABLE risk_assessments ADD COLUMN counterfactuals JSONB;
