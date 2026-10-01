-- Fun, unique beach/pool display names ("Salty Flamingo") for users without an X handle.
-- Idempotent: safe to re-run. pp_random_anon_name() is also the column default, so every insert path
-- gets a name. To change the word lists later, CREATE OR REPLACE the function in a new migration.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "anon_name" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_anon_name_key" ON "users" USING btree ("anon_name");--> statement-breakpoint
CREATE OR REPLACE FUNCTION pp_random_anon_name() RETURNS varchar
LANGUAGE plpgsql VOLATILE AS $fn$
DECLARE
  adjectives text[] := ARRAY[
    'Salty', 'Turbo', 'Sunny', 'Breezy', 'Golden', 'Sandy', 'Mellow', 'Zesty', 'Cosmic', 'Lucky',
    'Sparkly', 'Funky', 'Groovy', 'Chill', 'Bubbly', 'Tropical', 'Minty', 'Peppy', 'Jolly', 'Dizzy',
    'Snappy', 'Sleepy', 'Sneaky', 'Speedy', 'Fizzy', 'Frosty', 'Toasty', 'Wavy', 'Shiny', 'Glossy',
    'Crispy', 'Plucky', 'Zippy', 'Bouncy', 'Cheeky', 'Dapper', 'Electric', 'Fearless', 'Gentle', 'Happy',
    'Jazzy', 'Lively', 'Merry', 'Neon', 'Nimble', 'Radiant', 'Rad', 'Sassy', 'Silky', 'Smooth',
    'Balmy', 'Starry', 'Sunlit', 'Swift', 'Tidal', 'Velvet', 'Witty', 'Daring', 'Sunkissed', 'Hazy'
  ];
  nouns text[] := ARRAY[
    'Flamingo', 'Seahorse', 'Dolphin', 'Starfish', 'Pelican', 'Seagull', 'Turtle', 'Octopus', 'Crab', 'Lobster',
    'Walrus', 'Otter', 'Manatee', 'Narwhal', 'Jellyfish', 'Stingray', 'Pufferfish', 'Clownfish', 'Sandpiper', 'Puffin',
    'Penguin', 'Coconut', 'Pineapple', 'Mango', 'Papaya', 'Surfboard', 'Sandcastle', 'Seashell', 'Lifeguard', 'Snorkel',
    'Flipper', 'Beachball', 'Floatie', 'Lagoon', 'Tidepool', 'Cabana', 'Hammock', 'Parasol', 'Sunhat', 'Sandal',
    'Popsicle', 'Smoothie', 'Lemonade', 'Tiki', 'Ukulele', 'Conch', 'Barnacle', 'Kelp', 'Marlin', 'Swordfish',
    'Seal', 'Orca', 'Sunfish', 'Squid', 'Anemone', 'Urchin', 'Driftwood', 'Boardwalk', 'Paddleboard', 'Kayak'
  ];
  candidate text;
  attempt int := 0;
BEGIN
  LOOP
    attempt := attempt + 1;
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
      || ' ' || nouns[1 + floor(random() * array_length(nouns, 1))::int];
    -- 3,600 combinations; if the space ever gets crowded, add a small number suffix.
    IF attempt > 50 THEN
      candidate := candidate || ' ' || (2 + floor(random() * 998))::int;
    END IF;
    -- Retry on collision.
    EXIT WHEN NOT EXISTS (SELECT 1 FROM "users" WHERE "anon_name" = candidate);
  END LOOP;
  RETURN candidate;
END
$fn$;--> statement-breakpoint
-- Backfill existing users without X, one row at a time so each pick sees the previous ones.
DO $bf$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT "id" FROM "users" WHERE "anon_name" IS NULL AND "x_handle" IS NULL ORDER BY "id" LOOP
    UPDATE "users" SET "anon_name" = pp_random_anon_name() WHERE "id" = r."id";
  END LOOP;
END
$bf$;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "anon_name" SET DEFAULT pp_random_anon_name();
