ALTER TABLE admin_course_permissions
  ADD COLUMN course_prefix varchar(50);

UPDATE admin_course_permissions permissions
SET course_prefix = UPPER(BTRIM(courses.course_code))
FROM courses
WHERE courses.id = permissions.course_id;

ALTER TABLE admin_course_permissions
  ALTER COLUMN course_prefix SET NOT NULL,
  DROP CONSTRAINT admin_course_permissions_user_course_key,
  DROP CONSTRAINT admin_course_permissions_course_id_fkey,
  DROP COLUMN course_id,
  ADD CONSTRAINT admin_course_permissions_prefix_check CHECK (CHAR_LENGTH(BTRIM(course_prefix)) > 0),
  ADD CONSTRAINT admin_course_permissions_user_prefix_key UNIQUE (user_id, course_prefix);

ALTER TABLE admin_course_permissions
  RENAME TO admin_course_prefix_permissions;

UPDATE rooms
SET room_number = UPPER(BTRIM(COALESCE(NULLIF(room_number, ''), room_code)));

ALTER TABLE rooms
  ALTER COLUMN room_number SET NOT NULL,
  DROP CONSTRAINT rooms_room_code_key,
  DROP COLUMN room_code,
  ADD CONSTRAINT rooms_room_number_key UNIQUE (room_number);
