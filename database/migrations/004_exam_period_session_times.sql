ALTER TABLE exam_periods
  ADD COLUMN morning_start_time time NOT NULL DEFAULT TIME '09:30',
  ADD COLUMN morning_end_time time NOT NULL DEFAULT TIME '12:30',
  ADD COLUMN afternoon_start_time time NOT NULL DEFAULT TIME '14:30',
  ADD COLUMN afternoon_end_time time NOT NULL DEFAULT TIME '17:30';

ALTER TABLE exam_periods
  ADD CONSTRAINT exam_periods_morning_time_range_check
    CHECK (morning_end_time > morning_start_time),
  ADD CONSTRAINT exam_periods_afternoon_time_range_check
    CHECK (afternoon_end_time > afternoon_start_time),
  ADD CONSTRAINT exam_periods_session_order_check
    CHECK (afternoon_start_time >= morning_end_time);
